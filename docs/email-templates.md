# Templates de email de Supabase (branded)

Los mails que Supabase le manda a tus clientes (invitación, reset de contraseña,
confirmación) usan HTML propio. Pegá estos en:

**Supabase → Authentication → Emails → Templates** — elegí cada tipo y reemplazá
el HTML por el de abajo. Usan las variables de Supabase (`{{ .ConfirmationURL }}`).

> Requisito: tener el **SMTP propio** configurado (Resend) para que lleguen a
> mails externos. La imagen de la mascota se sirve desde `https://cicalino.net/bell-light.png`.

---

## Invite user (invitación al dueño)

```html
<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f4f1da;font-family:'Archivo',Helvetica,Arial,sans-serif;color:#20264f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1da;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #e7e3cf;border-radius:24px;">
      <tr><td align="center" style="padding:36px 32px 8px;">
        <img src="https://cicalino.net/bell-light.png" width="92" height="92" alt="Cicalino" style="display:block;border:0;">
      </td></tr>
      <tr><td align="center" style="padding:8px 32px 32px;">
        <h1 style="margin:0 0 14px;font-size:26px;line-height:1.1;font-weight:800;text-transform:uppercase;letter-spacing:-.02em;color:#2536d4;">Bienvenido a Cicalino</h1>
        <div style="font-size:15px;line-height:1.65;">
          <p style="margin:0 0 6px;">Te dimos de alta en Cicalino 🎉</p>
          <p style="margin:0;">Hacé clic para poner tu contraseña y entrar a tu panel.</p>
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px;"><tr><td style="border-radius:999px;background:#2536d4;">
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#f4f1da;text-decoration:none;border-radius:999px;">Activar mi cuenta</a>
        </td></tr></table>
      </td></tr>
    </table>
    <p style="margin:18px 0 0;font-size:12px;color:#20264f;opacity:.5;">Cicalino · Avisos de pedido por QR · info@cicalino.net</p>
  </td></tr></table>
</body></html>
```

---

## Reset password (recuperar contraseña)

```html
<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f4f1da;font-family:'Archivo',Helvetica,Arial,sans-serif;color:#20264f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1da;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #e7e3cf;border-radius:24px;">
      <tr><td align="center" style="padding:36px 32px 8px;">
        <img src="https://cicalino.net/bell-light.png" width="92" height="92" alt="Cicalino" style="display:block;border:0;">
      </td></tr>
      <tr><td align="center" style="padding:8px 32px 32px;">
        <h1 style="margin:0 0 14px;font-size:26px;line-height:1.1;font-weight:800;text-transform:uppercase;letter-spacing:-.02em;color:#2536d4;">Restablecer contraseña</h1>
        <div style="font-size:15px;line-height:1.65;">
          <p style="margin:0;">Pediste cambiar tu contraseña. Hacé clic abajo para elegir una nueva. Si no fuiste vos, ignorá este mail.</p>
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px;"><tr><td style="border-radius:999px;background:#2536d4;">
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#f4f1da;text-decoration:none;border-radius:999px;">Cambiar contraseña</a>
        </td></tr></table>
      </td></tr>
    </table>
    <p style="margin:18px 0 0;font-size:12px;color:#20264f;opacity:.5;">Cicalino · info@cicalino.net</p>
  </td></tr></table>
</body></html>
```

---

## Confirm signup (confirmar email)

```html
<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f4f1da;font-family:'Archivo',Helvetica,Arial,sans-serif;color:#20264f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1da;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #e7e3cf;border-radius:24px;">
      <tr><td align="center" style="padding:36px 32px 8px;">
        <img src="https://cicalino.net/bell-light.png" width="92" height="92" alt="Cicalino" style="display:block;border:0;">
      </td></tr>
      <tr><td align="center" style="padding:8px 32px 32px;">
        <h1 style="margin:0 0 14px;font-size:26px;line-height:1.1;font-weight:800;text-transform:uppercase;letter-spacing:-.02em;color:#2536d4;">Confirmá tu email</h1>
        <div style="font-size:15px;line-height:1.65;">
          <p style="margin:0;">Un último paso: confirmá tu email para activar tu cuenta de Cicalino.</p>
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px;"><tr><td style="border-radius:999px;background:#2536d4;">
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#f4f1da;text-decoration:none;border-radius:999px;">Confirmar email</a>
        </td></tr></table>
      </td></tr>
    </table>
    <p style="margin:18px 0 0;font-size:12px;color:#20264f;opacity:.5;">Cicalino · info@cicalino.net</p>
  </td></tr></table>
</body></html>
```
