import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { buildCsp, cspEnforce } from "@/lib/security/csp";

type CookieItem = { name: string; value: string; options?: CookieOptions };

const nuevoNonce = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
};

export const middleware = async (req: NextRequest) => {
  const path = req.nextUrl.pathname;
  const protegido = path.startsWith("/panel") || path.startsWith("/admin");
  const esLogin = path === "/login" || path === "/entrar";

  const nonce = nuevoNonce();
  const enforce = cspEnforce();
  /* La política sale distinta según la ruta: con nonce donde Next lo puede
   * estampar (páginas dinámicas) y sin él en las estáticas, que se generan en
   * el build. Ver el comentario largo en lib/security/csp.ts. */
  const csp = buildCsp(nonce, enforce, path);
  const cspHeader = enforce
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);
  // Next lee esta cabecera del request para poner el nonce en sus scripts.
  reqHeaders.set("Content-Security-Policy", csp);

  const conCsp = <T extends NextResponse>(r: T): T => {
    r.headers.set(cspHeader, csp);
    return r;
  };

  const seguir = () =>
    conCsp(NextResponse.next({ request: { headers: reqHeaders } }));

  /* En una ruta pública no hay nada que decidir con la sesión, así que no la
   * consultamos. `getUser()` es una llamada de red al servidor de Auth de
   * Supabase, y antes salía en TODAS las requests que pasaran por acá.
   *
   * La pantalla del cliente pollea cada 3-8 segundos mientras espera su
   * pedido, así que esa llamada de más estaba en el camino más caliente de la
   * app: latencia extra para el cliente final y una request a Supabase por
   * cada poll, sin usarse para nada.
   *
   * El refresco de sesión que hace getUser() sigue ocurriendo en /panel y
   * /admin, que es donde navegan los usuarios logueados. */
  if (!protegido && !esLogin) return seguir();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if ((!url || !anon) && process.env.NODE_ENV === "production" && protegido) {
    return conCsp(
      new NextResponse("Cicalino: faltan variables de Supabase en el deploy.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    );
  }

  if (!url || !anon) return seguir();

  let res = NextResponse.next({ request: { headers: reqHeaders } });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: CookieItem[]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: { headers: reqHeaders } });
        list.forEach(({ name, value, options }) =>
          res.cookies.set({ name, value, ...options }),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (protegido && !user) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", path);
    return conCsp(NextResponse.redirect(login));
  }

  if (user && esLogin) {
    const { data: perfil } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("id", user.id)
      .maybeSingle();
    const dest = req.nextUrl.clone();
    dest.pathname = perfil?.rol === "superadmin" ? "/admin" : "/panel";
    dest.search = "";
    return conCsp(NextResponse.redirect(dest));
  }

  return conCsp(res);
};

export const config = {
  matcher: [
    /* Las rutas de /api no renderizan HTML, así que no necesitan CSP ni nonce,
     * y ninguna depende del middleware para autorizar: las protegidas lo
     * resuelven ellas mismas. Sacarlas de acá evita ejecutar el middleware en
     * el endpoint más llamado de la app.
     *
     * /monitoring es el túnel de Sentry: reenvía eventos y no tiene por qué
     * pasar por acá. */
    "/((?!api/|monitoring|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
