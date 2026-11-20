# Container image

The UI builds into one container image that runs the Next.js server (standalone output) as a non-root user (uid 1001) on port 3000. It is meant for the Kubernetes dev environment next to the API; the Helm chart lives in `hardik-id/knowledge-extractor-api` (`deploy/helm/`) and only needs an image name. There is no registry push and no pipeline here.

## One image per environment

The public settings are `NEXT_PUBLIC_*` values that Next.js compiles into the browser bundle at build time. They are build arguments, they have no defaults, and they cannot be changed when the container runs. An image built for dev points at the dev API and the dev app registration; build another image for another environment.

| Build argument                | Notes                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_BACKEND_MODE`    | `mock` or `http`                                                                             |
| `NEXT_PUBLIC_API_BASE_URL`    | needed for `http`, e.g. `https://api.dev.example.com/api/v1`                                 |
| `NEXT_PUBLIC_WS_BASE_URL`     | optional, default: the API's host over `wss://`                                              |
| `NEXT_PUBLIC_AUTH_MODE`       | `entra` for `http` (the build refuses anything else); `none` for the mock                    |
| `NEXT_PUBLIC_ENTRA_TENANT_ID` | needed for `entra`                                                                           |
| `NEXT_PUBLIC_ENTRA_CLIENT_ID` | needed for `entra`                                                                           |
| `NEXT_PUBLIC_ENTRA_API_SCOPE` | optional, default `api://<client id>/access_as_user`                                         |
| `NEXT_PUBLIC_APPS`            | always pass it: `studio` (an unset argument reaches the build as an empty list, which fails) |

`NEXT_PUBLIC_DEV_ACCESS_TOKEN` is never a build argument: a token must not end up in an image.

## Build

Against the real API (placeholder ids; use the real ones for the environment):

```sh
docker build -t knowledge-ui:dev \
  --build-arg NEXT_PUBLIC_BACKEND_MODE=http \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.dev.example.com/api/v1 \
  --build-arg NEXT_PUBLIC_WS_BASE_URL=wss://api.dev.example.com \
  --build-arg NEXT_PUBLIC_AUTH_MODE=entra \
  --build-arg NEXT_PUBLIC_ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000 \
  --build-arg NEXT_PUBLIC_ENTRA_CLIENT_ID=11111111-1111-1111-1111-111111111111 \
  --build-arg NEXT_PUBLIC_APPS=studio .
```

With the in-browser mock (no backend, for a look at the image):

```sh
docker build -t knowledge-ui:mock \
  --build-arg NEXT_PUBLIC_BACKEND_MODE=mock \
  --build-arg NEXT_PUBLIC_AUTH_MODE=none \
  --build-arg NEXT_PUBLIC_APPS=studio .
```

The `.dockerignore` keeps `node_modules`, `.next`, `.env*`, tests and the end-to-end folders out of the build context, so a local `.env.local` never changes an image.

## Run

```sh
docker run --rm -p 8080:3000 knowledge-ui:dev
```

Then open `http://localhost:8080/studio`. With `entra` the page goes to Microsoft sign-in; Microsoft accepts http only for `localhost`, and the redirect address of the app registration must list the address the UI is served from.

## Probe path

`GET /healthz` answers `200` with `{"status":"ok"}` and `Cache-Control: no-store`. It is a route handler: it needs no backend and no sign-in, so use it for the liveness and readiness probes (port 3000).
