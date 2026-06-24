// Bun 1.3.x implements process.getBuiltinModule('v8') but throws on
// startupSnapshot.isBuildingSnapshot(). bson@7 calls this at module init.
// Stub it so the mongodb driver loads without crashing.
const orig = (process as unknown as Record<string, unknown>).getBuiltinModule as
  | ((name: string) => unknown)
  | undefined;

if (typeof orig === "function") {
  (process as unknown as Record<string, (name: string) => unknown>).getBuiltinModule = (
    name: string,
  ) => {
    if (name === "v8") {
      return {
        startupSnapshot: {
          isBuildingSnapshot: () => false,
          addSerializeCallback: () => {},
          addDeserializeCallback: () => {},
          setDeserializeMainFunction: () => {},
        },
      };
    }
    return orig(name);
  };
}
