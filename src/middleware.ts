import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ReadStar uses client-side auth via sessionStorage. Pass-through middleware.
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = { matcher: [] };
