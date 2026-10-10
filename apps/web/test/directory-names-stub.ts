interface StubPerson {
  id: string;
  name: string;
  username?: string;
  profile_kind?: string;
}

/**
 * Stand-in for `features/reference/directory-names` in screen tests: every
 * lookup hook answers from the given people, with no query client or API.
 * The real hooks have their own test (`directory-names.test.tsx`).
 */
export function directoryNamesStub(people: StubPerson[] = []) {
  const complete = people.map((person) => ({ username: person.id, ...person }));
  const byId = new Map(complete.map((person) => [person.id, person]));
  return {
    DIRECTORY_NAMES_CHUNK_SIZE: 100,
    DIRECTORY_SEARCH_LIMIT: 50,
    useDirectoryNames: () => byId,
    useDirectoryLookup: () => ({
      names: byId,
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: () => undefined,
    }),
    useDirectoryName: (id: string | null | undefined) => byId.get(id ?? ""),
    useDirectorySearch: () => ({ data: complete, isFetching: false }),
    useDirectoryNamePeek: () => (id: string) => byId.get(id),
    useResolveDirectoryNames: () => () => Promise.resolve(byId),
  };
}
