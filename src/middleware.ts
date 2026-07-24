import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieItem = { name: string; value: string; options?: CookieOptions };

// Refresca la sesión de Supabase en (casi) todas las rutas para que la cookie
// no expire al navegar a landing/precios/etc. Solo redirige a /login en áreas
// protegidas sin usuario.
export const middleware = async (req: NextRequest) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: CookieItem[]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) =>
          res.cookies.set({ name, value, ...options }),
        );
      },
    },
  });

  // getUser valida/refresca la sesión (actualiza cookies via setAll).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const protegido = path.startsWith("/panel") || path.startsWith("/admin");

  if (protegido && !user) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  // Si ya hay sesión y entra a /login, mandarlo a su área (según rol).
  if (user && (path === "/login" || path === "/entrar")) {
    const { data: perfil } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("id", user.id)
      .maybeSingle();
    const dest = req.nextUrl.clone();
    dest.pathname = perfil?.rol === "superadmin" ? "/admin" : "/panel";
    dest.search = "";
    return NextResponse.redirect(dest);
  }

  return res;
};

export const config = {
  matcher: [
    /*
     * Refrescar sesión en páginas HTML; excluir estáticos y APIs públicas
     * que no necesitan cookie (assets, sw, etc.).
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
