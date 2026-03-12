import { NextResponse } from 'next/server';

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  error: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, init);
}

export function jsonError(error: string, status = 400) {
  return NextResponse.json<ApiFailure>({ ok: false, error }, { status });
}

export async function readJsonObject<T extends Record<string, unknown>>(
  request: Request
): Promise<T | null> {
  try {
    const body = (await request.json()) as unknown;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return null;
    }

    return body as T;
  } catch {
    return null;
  }
}
