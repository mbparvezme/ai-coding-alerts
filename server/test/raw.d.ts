// Vite `?raw` imports (e.g. schema.sql) resolve to the file's text content.
declare module "*?raw" {
  const content: string;
  export default content;
}
