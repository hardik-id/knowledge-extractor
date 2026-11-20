import { mintToken } from "./support/people";

/**
 * Tokens come from the running container: check that once, with one clear message,
 * not in every test. (That the backend is up is checked while the config loads.)
 */
export default async function globalSetup() {
  mintToken("00000000-0000-4000-8000-000000000000");
}
