declare module "pg" {
  export interface QueryResultRow {
    [column: string]: unknown;
  }
  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    rows: R[];
  }
  export class Client {
    constructor(config?: {
      connectionString?: string;
      ssl?: boolean | { rejectUnauthorized?: boolean };
    });
    connect(): Promise<void>;
    end(): Promise<void>;
    query<R extends QueryResultRow = QueryResultRow>(
      text: string,
    ): Promise<QueryResult<R>>;
  }
}
