// Comprobación OPTIMISTA: si no hay cookie de sesión, las páginas redirigen a /login. No verifica
// la cookie (eso es caro y el proxy no es el lugar): la verificación real está en cada Route Handler
// con `exigirUsuario`. Las rutas /api responden 401 por sí solas.

import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (!request.cookies.has("sesion")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Todo menos /login, /api, archivos internos de Next y estáticos.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
