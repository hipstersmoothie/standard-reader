export type ApiDocsExampleResult = {
  nsid: string;
  curl: string;
  status: number;
  /** JSON-serialized response body. */
  bodyJson: string;
  durationMs: number;
  fetchedAt: string;
};

/** Tag picklist entry for getTagFeed interactive params. */
export type ApiDocsTagOption = {
  id: string;
  label: string;
  count: number;
};
