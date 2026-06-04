// Prefix a root-relative path ("/about/") with the deploy base ("/karldritz").
export const url = (path: string) =>
  import.meta.env.BASE_URL.replace(/\/$/, '') + path;
