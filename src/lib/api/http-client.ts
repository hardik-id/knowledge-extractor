/**
 * A small fetch wrapper with a middleware chain. One client is created per
 * backend and shared by every service, so auth, retries, timeouts and error
 * handling live in one place instead of in each call.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** A request as middleware sees it. The body is a string so it can be sent again on retry. */
export interface ApiRequest {
  method: HttpMethod;
  url: string;
  headers: Headers;
  body?: string;
  signal?: AbortSignal;
  /** Overrides the client's default timeout for this call. */
  timeoutMs?: number;
}

export type Next = (request: ApiRequest) => Promise<Response>;

/** Wraps the rest of the chain: change the request, call `next`, inspect or replace the response. */
export type Middleware = (request: ApiRequest, next: Next) => Promise<Response>;

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: QueryParams;
  /** Sent as JSON. */
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface HttpClientOptions {
  baseUrl: string;
  /** Outermost first: the first middleware sees the request first and the response last. */
  middlewares?: Middleware[];
  /** Replaceable for tests. */
  fetch?: typeof fetch;
}

export interface HttpClient {
  /** The raw response, for callers that need headers (e.g. ETag) or a non-JSON body. */
  request(method: HttpMethod, path: string, options?: RequestOptions): Promise<Response>;
  /** Parsed JSON as `unknown`: validate it before use. Resolves to `undefined` for an empty body. */
  get(path: string, options?: RequestOptions): Promise<unknown>;
  post(path: string, options?: RequestOptions): Promise<unknown>;
  delete(path: string, options?: RequestOptions): Promise<unknown>;
}

export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const url = `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : undefined;
}

export function createHttpClient({
  baseUrl,
  middlewares = [],
  fetch: fetchImpl,
}: HttpClientOptions): HttpClient {
  const send: Next = (request) =>
    (fetchImpl ?? fetch)(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal,
    });

  // Fold right so middlewares[0] ends up outermost.
  const chain = middlewares.reduceRight<Next>(
    (next, middleware) => (request) => middleware(request, next),
    send,
  );

  const request: HttpClient["request"] = (method, path, options = {}) => {
    const headers = new Headers(options.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    let body: string | undefined;
    if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers.set("Content-Type", "application/json");
    }
    return chain({
      method,
      url: buildUrl(baseUrl, path, options.query),
      headers,
      body,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  };

  const json = (method: HttpMethod) => (path: string, options?: RequestOptions) =>
    request(method, path, options).then(readJson);

  return { request, get: json("GET"), post: json("POST"), delete: json("DELETE") };
}
