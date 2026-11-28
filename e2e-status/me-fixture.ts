/** The wire body the stubbed backend answers for GET /me; a unit test parses it with the app's parser. */
export const stubMeBody = (platformAdmin: boolean) => ({
  id: 1,
  name: "Stub person",
  preferred_username: "stub@example.com",
  platform_admin: platformAdmin,
  tenants: [{ id: "tenant-1", name: "Default", role: "member" }],
});
