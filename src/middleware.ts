import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // Redirect root to /ops
    // Redirect root to /ops - REMOVED TO ENABLE DASHBOARD
    /*
    if (request.nextUrl.pathname === '/') {
        return NextResponse.redirect(new URL('/ops', request.url));
    }
    */
    return NextResponse.next();
}

export const config = {
    matcher: '/',
};
