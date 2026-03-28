export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface HttpClientOptions {
  timeout?: number;
}

export interface HttpClient {
  request(req: HttpRequest): Promise<HttpResponse>;
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const timeout = options.timeout ?? 30000;

  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body,
          signal: controller.signal,
        });

        const responseBody = await response.text();
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        return { status: response.status, body: responseBody, headers };
      } catch (err: any) {
        if (err.name === 'AbortError') {
          throw new Error(`Request to ${req.url} timed out after ${timeout}ms`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
