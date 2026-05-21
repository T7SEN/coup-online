// Email templates for transactional mail sent via Resend.
//
// Two senders: magic-link sign-in (`magicLinkEmail`) and 2FA email-OTP
// (`twoFactorOtpEmail`). Both run through `sendResendEmail` in auth.ts.
//
// Design constraints baked in:
//
//   - **Table-based layout.** Outlook 2007–2019 still renders mail via Word's
//     HTML engine and ignores most modern CSS. A `<table>` + inline styles is
//     the lowest common denominator that survives every major client.
//
//   - **Inline styles only.** Gmail strips `<style>` tags from the body in
//     some contexts; classes only survive when also expressed inline. The one
//     exception is the dark-mode `<style>` block in `<head>`, which most
//     modern clients (Apple Mail, iOS Mail, Outlook for Mac/iOS) read.
//
//   - **Web-safe fonts with serif fallbacks.** Cinzel / EB Garamond won't load
//     in mail clients without expensive @font-face workarounds. Georgia is the
//     widely-installed serif that's closest in feel to the in-app type, so
//     it's the primary font for both heading and body.
//
//   - **Renaissance-court palette, hex-converted.** Site uses OKLCH which mail
//     clients don't support; values below are sRGB approximations of the
//     globals.css tokens. Light mode by default; `prefers-color-scheme: dark`
//     media query flips the relevant pieces.
//
//   - **600px max width.** Industry standard — wider breaks Outlook desktop;
//     narrower wastes real estate on big screens. Mobile @media query tightens
//     padding and reduces heading/code sizes for ~480px viewports.
//
//   - **Brand mismatch mitigation.** From: is `Coup Online <noreply@t7sen.com>`
//     (sender domain ≠ app domain). The footer reads "Sent via t7sen.com on
//     behalf of Coup Online" so recipients who check have an honest answer.

interface EmailContent {
  subject: string
  html: string
  text: string
}

// Renaissance-court palette in hex. Match globals.css OKLCH values as closely
// as sRGB allows.
const PALETTE = {
  parchment: '#F8F2E2', // page background
  card: '#FCF8EB', // inner card
  border: '#DCCFB8', // hairline
  text: '#3D2F22', // primary body text
  muted: '#6D5B49', // secondary / footer text
  gold: '#D5A24D', // accent + button (light)
  oxblood: '#872626', // primary CTA fill (light)
  onOxblood: '#F8F3E3', // text on oxblood button
  codeBackground: '#F1E7CC', // OTP code panel bg
} as const

// Shared HTML shell. Every email renders inside this — wordmark header, a
// single content card, and a footer with brand legitimacy.
function emailLayout({
  title,
  preheader,
  bodyHtml,
}: {
  title: string
  preheader: string
  bodyHtml: string
}): string {
  return `<!doctype html>
<html lang="en" style="margin: 0; padding: 0;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(title)}</title>
  <style>
    /* Dark-mode flip — Apple Mail / iOS Mail / Outlook (Mac, iOS) honor
       prefers-color-scheme. Gmail and Outlook.com classic ignore this and
       render the light version unchanged. */
    @media (prefers-color-scheme: dark) {
      body, .email-bg { background-color: #1A1410 !important; }
      .email-card { background-color: #221B15 !important; border-color: #5C4628 !important; }
      .email-heading { color: #F8E9C8 !important; }
      .email-text { color: #E5DCC8 !important; }
      .email-muted { color: #9F8A75 !important; }
      .email-code-bg { background-color: #1A1410 !important; border-color: #5C4628 !important; }
      .email-code { color: #F8E9C8 !important; }
      .email-wordmark { color: #D5A24D !important; }
      .email-button { background-color: #D5A24D !important; color: #1A1410 !important; }
      .email-link { color: #D5A24D !important; }
    }
    /* Narrow viewport tweak — tighter padding, smaller heading + OTP code. */
    @media (max-width: 480px) {
      .email-card { padding: 28px 20px !important; }
      .email-heading { font-size: 22px !important; }
      .email-code { font-size: 28px !important; letter-spacing: 8px !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin: 0; padding: 24px 16px; background-color: ${PALETTE.parchment}; font-family: Georgia, 'Times New Roman', Times, serif; color: ${PALETTE.text}; line-height: 1.5; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <!-- Preheader: shown in the inbox preview line, hidden in the body. -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${PALETTE.parchment};">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px;">
          <!-- Header / wordmark. Typography-only so it survives every client. -->
          <tr>
            <td align="center" style="padding: 8px 0 24px;">
              <p class="email-wordmark" style="margin: 0; font-family: Georgia, 'Times New Roman', Times, serif; font-size: 13px; font-weight: 700; letter-spacing: 6px; color: ${PALETTE.oxblood}; text-transform: uppercase;">
                Coup Online
              </p>
            </td>
          </tr>
          <!-- Content card. -->
          <tr>
            <td class="email-card" style="background-color: ${PALETTE.card}; border: 1px solid ${PALETTE.border}; border-radius: 6px; padding: 36px 36px;">
${bodyHtml}
            </td>
          </tr>
          <!-- Footer with brand legitimacy + sender disclosure. -->
          <tr>
            <td align="center" style="padding: 24px 8px 8px;">
              <p class="email-muted" style="margin: 0 0 6px; font-family: Georgia, 'Times New Roman', Times, serif; font-size: 12px; color: ${PALETTE.muted};">
                Coup Online &middot; <a href="https://coups.app" class="email-link" style="color: ${PALETTE.muted}; text-decoration: underline;">coups.app</a>
              </p>
              <p class="email-muted" style="margin: 0; font-family: Georgia, 'Times New Roman', Times, serif; font-size: 11px; color: ${PALETTE.muted};">
                Sent via t7sen.com on behalf of Coup Online. If you didn&rsquo;t request this, you can safely ignore the email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Minimal HTML escape for user-influenced strings (title, preheader). The
// rendered body templates use trusted inputs (a server-generated URL or OTP),
// but defense-in-depth: never interpolate without escaping.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ----------------------------------------------------------------------------
// Magic-link sign-in
// ----------------------------------------------------------------------------
//
// Sent by Better Auth's `magicLink` plugin via auth.ts's `sendResendEmail`
// helper when a visitor enters their email on /auth/signin. The link expires
// in a few minutes and is single-use; the actual TTL is owned by Better Auth
// and not exposed to this template.

export function magicLinkEmail(url: string): EmailContent {
  const subject = 'Your Coup Online sign-in link'
  const preheader = 'One click to take your seat at the table.'

  const bodyHtml = `
              <h1 class="email-heading" style="margin: 0 0 16px; font-family: Georgia, 'Times New Roman', Times, serif; font-size: 24px; font-weight: 600; color: ${PALETTE.text}; letter-spacing: 0.3px;">
                Take your seat
              </h1>
              <p class="email-text" style="margin: 0 0 24px; font-family: Georgia, 'Times New Roman', Times, serif; font-size: 16px; color: ${PALETTE.text}; line-height: 1.6;">
                Click the button below to sign in to Coup Online. The link expires shortly and can only be used once.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding: 4px 0 24px;">
                    <a href="${url}" class="email-button" style="display: inline-block; background-color: ${PALETTE.oxblood}; color: ${PALETTE.onOxblood}; font-family: Georgia, 'Times New Roman', Times, serif; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 4px; letter-spacing: 0.4px; mso-padding-alt: 14px 36px;">
                      Sign in to Coup Online
                    </a>
                  </td>
                </tr>
              </table>
              <p class="email-muted" style="margin: 24px 0 6px; font-family: Georgia, 'Times New Roman', Times, serif; font-size: 13px; color: ${PALETTE.muted}; line-height: 1.5;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0; font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; color: ${PALETTE.text}; word-break: break-all; line-height: 1.5;">
                <a href="${url}" class="email-link" style="color: ${PALETTE.oxblood}; text-decoration: underline;">${escapeHtml(url)}</a>
              </p>
`

  const text = `COUP ONLINE — Take your seat
=============================

Click the link below to sign in to Coup Online. The link expires shortly and can only be used once.

${url}

If you didn't request this, you can safely ignore the email.

—
Coup Online · https://coups.app
Sent via t7sen.com on behalf of Coup Online.
`

  return {
    subject,
    html: emailLayout({ title: subject, preheader, bodyHtml }),
    text,
  }
}

// ----------------------------------------------------------------------------
// 2FA email OTP
// ----------------------------------------------------------------------------
//
// Sent during a mid-sign-in 2FA challenge when the user picks "Email" on
// the /auth/two-factor page. Code is a 6-digit number from Better Auth's
// twoFactor plugin (period: 3 minutes, digits: 6 — see auth.ts).

export function twoFactorOtpEmail(code: string): EmailContent {
  const subject = 'Your Coup Online verification code'
  const preheader = `Code: ${code} — expires in 3 minutes.`

  const bodyHtml = `
              <h1 class="email-heading" style="margin: 0 0 16px; font-family: Georgia, 'Times New Roman', Times, serif; font-size: 24px; font-weight: 600; color: ${PALETTE.text}; letter-spacing: 0.3px;">
                Your verification code
              </h1>
              <p class="email-text" style="margin: 0 0 20px; font-family: Georgia, 'Times New Roman', Times, serif; font-size: 16px; color: ${PALETTE.text}; line-height: 1.6;">
                Enter this code on the two-factor verification page to finish signing in.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" class="email-code-bg" style="padding: 22px 16px; background-color: ${PALETTE.codeBackground}; border: 1px solid ${PALETTE.border}; border-radius: 4px;">
                    <p class="email-code" style="margin: 0; font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace; font-size: 34px; font-weight: 700; letter-spacing: 14px; color: ${PALETTE.text};">
                      ${escapeHtml(code)}
                    </p>
                  </td>
                </tr>
              </table>
              <p class="email-muted" style="margin: 20px 0 0; font-family: Georgia, 'Times New Roman', Times, serif; font-size: 13px; color: ${PALETTE.muted}; line-height: 1.55;">
                This code expires in 3 minutes. If you didn&rsquo;t try to sign in, someone else may have your password &mdash; change your sign-in method from your account settings.
              </p>
`

  const text = `COUP ONLINE — Verification code
================================

Enter this code on the two-factor verification page to finish signing in:

    ${code}

This code expires in 3 minutes.

If you didn't request this, someone else may be trying to sign in to your account. Change your sign-in method from your account settings.

—
Coup Online · https://coups.app
Sent via t7sen.com on behalf of Coup Online.
`

  return {
    subject,
    html: emailLayout({ title: subject, preheader, bodyHtml }),
    text,
  }
}
