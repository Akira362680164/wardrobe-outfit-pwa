# Unified Account Auth With Email And WeChat OpenID Design

## Goal

Replace the unavailable WeChat phone-number login path with a unified account model shared by the Android App, PWA, and WeChat mini program. Email becomes the primary verified identity; phone remains an optional login name paired with password; WeChat mini program login uses `wx.login` and an OpenID binding flow.

## Non-Goals

- Do not keep `open-type="getPhoneNumber"` in the mini program main login flow.
- Do not use `/api/auth/wechat/phone-login` as the mini program main login flow.
- Do not introduce local business-data cache, outbox, or hidden sync fallback.
- Do not wire a real email provider in phase 1.
- Do not implement email change, phone change, WeChat unbind, or WeChat rebind in phase 1 unless the main flows are already complete and validated.

## Product Principles

- `users.id` is the only workspace owner identity. App, PWA, and mini program must use the same `userId`, token model, refresh token model, and server workspace data.
- Email is the primary recoverable identity. It supports registration confirmation, login, password reset, and email-code password change.
- Phone number is an optional login name. It can be used as `phone + password`, but the UI must label it as `登录名`, not `已验证`.
- WeChat OpenID is a mini-program convenience credential. It must never be returned to the client and must be stored only as a keyed hash.
- First-time WeChat login must not silently create an account. It must branch into `绑定已有账号` or `注册新账号`.

## Phases

### Phase 1: Account System With Mock Email

Build the full account model, APIs, verification state machine, App/PWA UI, mini program UI, and tests. Email delivery uses `MockEmailSender` or `LogEmailSender`; in development, the verification code is written to server logs. A test-only code lookup endpoint may exist only when `NODE_ENV=test` or `WARDROBE_AUTH_TEST=1`.

### Phase 2: Real Email Provider

Configure domain, sender address, API key, and provider-specific secrets. Replace the mock sender with `ResendEmailSender`, `SesEmailSender`, or `SmtpEmailSender` behind the same `EmailSender` interface. Prefer provider calls through `fetch` before adding a new SDK dependency.

### Phase 3: Real-Device Validation

Validate on mini program real device and Android App with a real inbox: registration, email verification, password reset, password change, WeChat binding, logout, login, and cross-client workspace visibility.

## Data Model

### New Tables

`email_identities`

- `id uuid primary key`
- `user_id uuid not null references users(id) on delete cascade`
- `email_normalized text not null unique`
- `email_masked text not null`
- `verified_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- unique index on `user_id`

`email_verification_challenges`

- `id uuid primary key`
- `email_normalized text not null`
- `code_hash text not null`
- `purpose text not null`
- `user_id uuid null references users(id) on delete cascade`
- `binding_ticket_id uuid null`
- `attempts integer not null default 0`
- `expires_at timestamptz not null`
- `consumed_at timestamptz null`
- `created_ip_hash text null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- index on `email_normalized, purpose`
- index on `expires_at`

`wechat_identities`

- `id uuid primary key`
- `user_id uuid not null references users(id) on delete cascade`
- `app_id text not null`
- `openid_hash text not null`
- `unionid_hash text null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- unique index on `app_id, openid_hash`
- unique index on `user_id, app_id`

`wechat_binding_tickets`

- `id uuid primary key`
- `ticket_hash text not null unique`
- `app_id text not null`
- `openid_hash text not null`
- `unionid_hash text null`
- `expires_at timestamptz not null`
- `consumed_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- index on `expires_at`

### Existing Tables

- `users` remains the business-account root.
- `phone_identities` remains; `verified_at` stays nullable and must not be populated by new password registration.
- `password_credentials`, `device_sessions`, `refresh_tokens`, and `account_security_events` continue to back the token/session model.
- `wechat_accounts` remains for old-code compatibility and rollback. New code must not write to it.

## Backend APIs

### Shared Token User Shape

Token responses should include:

```json
{
  "accessToken": "...",
  "accessTokenExpiresAt": "...",
  "refreshToken": "...",
  "refreshTokenExpiresAt": "...",
  "user": {
    "id": "uuid",
    "emailMasked": "z***@example.com",
    "emailVerified": true,
    "phoneMasked": "138****1234",
    "phoneVerified": false,
    "displayName": "Wardora 用户"
  }
}
```

`phoneMasked` and `emailMasked` are optional in code, but at least one human-readable identity label should be present for a normal account.

### `POST /api/auth/email/send-code`

Request:

```json
{
  "email": "user@example.com",
  "purpose": "register",
  "bindingTicket": "optional"
}
```

Allowed `purpose` values in phase 1:

- `register`
- `wechat_register`
- `reset_password`
- `change_password`

Behavior:

- Normalize email by trim and lowercase.
- Validate email format.
- Generate a 6-digit numeric code.
- Store only HMAC/hash, never plaintext.
- Expire after 10 minutes.
- Allow at most 5 attempts.
- Enforce 30-second resend cooldown for the same email and purpose.
- In development, log a redacted line with masked email and code.
- In test mode, expose the code through a test-only helper or endpoint gated by test env.

Response:

```json
{
  "status": "sent",
  "emailMasked": "u***@example.com",
  "cooldownSeconds": 30,
  "expiresInSeconds": 600
}
```

### `POST /api/auth/register`

App/PWA direct email registration.

Request:

```json
{
  "email": "user@example.com",
  "emailCode": "123456",
  "password": "password123",
  "phone": "13800138000",
  "deviceId": "device-id",
  "deviceLabel": "Android 手机",
  "agreementVersion": "2026-07-08",
  "privacyVersion": "2026-07-08"
}
```

Behavior:

- Email, email code, password, and device ID are required.
- Phone is optional.
- Verify email code in the same request.
- Create `users`, verified `email_identities`, `password_credentials`, optional `phone_identities`, default location, and session.
- If phone is present, store `verified_at = null`.
- Return token response.

### `POST /api/auth/login`

Shared App/PWA/mini-program password login.

Request:

```json
{
  "account": "user@example.com",
  "password": "password123",
  "deviceId": "device-id",
  "deviceLabel": "Android 手机",
  "client": "android-app"
}
```

Behavior:

- If account contains `@`, authenticate through `email_identities`.
- If account matches phone rules, authenticate through `phone_identities`.
- Return `invalid_account_format` when neither format matches.
- Return `invalid_credentials` for missing account or wrong password, without account enumeration.
- If email exists but is unverified, return `email_unverified` and do not enter workspace.

### `POST /api/auth/password/reset/request`

Request:

```json
{
  "email": "user@example.com"
}
```

Behavior:

- Only verified emails can reset password.
- Response should avoid revealing whether the email exists when possible.
- Send code with `purpose=reset_password`.

### `POST /api/auth/password/reset/confirm`

Request:

```json
{
  "email": "user@example.com",
  "emailCode": "123456",
  "newPassword": "new-password"
}
```

Behavior:

- Verify code.
- Update password hash.
- Revoke all refresh tokens and sessions for the user.
- User must log in again.

### `POST /api/auth/password/change`

Request with current password:

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password"
}
```

Request with email code:

```json
{
  "emailCode": "123456",
  "newPassword": "new-password"
}
```

Phase 1 can implement this as two endpoints if simpler:

- `/api/auth/password/change`
- `/api/auth/password/change-with-email-code`

Behavior:

- Current-password change keeps the current session and revokes other sessions.
- Email-code change keeps the current session and revokes other sessions.

### `GET /api/auth/account/security`

Response:

```json
{
  "user": {
    "id": "uuid",
    "displayName": "Wardora 用户"
  },
  "email": {
    "bound": true,
    "masked": "z***@example.com",
    "verified": true
  },
  "phone": {
    "bound": true,
    "masked": "138****1234",
    "verified": false,
    "usage": "login_name"
  },
  "wechat": {
    "bound": true,
    "appId": "wx14a1a85b7b3844d0"
  },
  "password": {
    "set": true,
    "changedAt": "2026-07-09T12:00:00.000Z"
  }
}
```

### `POST /api/auth/wechat/login`

Mini-program WeChat login or registration entry.

Request:

```json
{
  "loginCode": "wx.login-code",
  "appId": "wx14a1a85b7b3844d0",
  "client": "wechat-miniprogram",
  "deviceId": "wechat-mini-device",
  "deviceLabel": "ios / iPhone / iOS 18"
}
```

Behavior:

- Backend calls WeChat `jscode2session`.
- Store/query only `openid_hash`.
- If OpenID is already bound, return token response with `status=logged_in`.
- If OpenID is not bound, create a `wechat_binding_ticket` and return `status=requires_account_binding`.
- Never return OpenID, UnionID, session key, or provider raw response to the client.

Unbound response:

```json
{
  "status": "requires_account_binding",
  "bindingTicket": "opaque-ticket",
  "expiresInSeconds": 600,
  "actions": ["bind_existing_account", "register_new_account"]
}
```

### `POST /api/auth/wechat/bind-existing-account`

Request:

```json
{
  "bindingTicket": "opaque-ticket",
  "account": "user@example.com",
  "password": "password123",
  "deviceId": "wechat-mini-device",
  "deviceLabel": "ios / iPhone / iOS 18"
}
```

Behavior:

- Verify ticket is valid, unexpired, and unconsumed.
- Authenticate account and password.
- Reject if OpenID already bound to another user.
- Reject if target user already has a WeChat identity for the same app ID.
- Create `wechat_identity`.
- Consume ticket.
- Return token response and enter workspace.

### `POST /api/auth/wechat/register-with-email`

Request:

```json
{
  "bindingTicket": "opaque-ticket",
  "email": "user@example.com",
  "emailCode": "123456",
  "password": "password123",
  "phone": "13800138000",
  "deviceId": "wechat-mini-device",
  "deviceLabel": "ios / iPhone / iOS 18",
  "agreementVersion": "2026-07-08",
  "privacyVersion": "2026-07-08"
}
```

Behavior:

- Verify ticket.
- Verify email code with `purpose=wechat_register`.
- Create user, verified email, password, optional phone login name, default location, and WeChat identity.
- Consume ticket and code.
- Return token response and enter workspace.

## Email Sender Design

Interface:

```ts
export interface EmailSender {
  sendVerificationCode(input: {
    to: string;
    emailMasked: string;
    code: string;
    purpose: EmailCodePurpose;
    minutes: number;
  }): Promise<void>;
}
```

Phase 1 implementations:

- `MockEmailSender`: stores sent messages in memory for tests.
- `LogEmailSender`: logs code in development only. Log line must include masked email and purpose, not password, token, OpenID, or binding ticket.

Phase 2 implementations:

- `ResendEmailSender`, `SesEmailSender`, or `SmtpEmailSender` behind the same interface.

## Shared UI Tokens

Use these tokens in App/PWA and mini program auth pages:

- Page background: `#FBFBF8`
- Main text: `#1F2933`
- Secondary text: `#6B7280`
- Muted text: `#9CA3AF`
- Primary: `#2F6B4F`
- Primary pressed: `#285A43`
- Error: `#B42318`
- Success: `#2F6B4F`
- Card background: `#FFFFFF`
- Card border: `rgba(31,41,51,0.08)`
- Input background: `#F7F7F3`
- Input border: `rgba(31,41,51,0.10)`
- Mini program page padding: `32rpx`
- Mini program content max width: `686rpx`
- Mini program main button height: `96rpx`
- Mini program main button radius: `28rpx`
- Mini program input height: `88rpx`
- Mini program input radius: `24rpx`
- App button height: `44px`
- App input height: `44px`
- App control radius: existing `ui-control-radius`

Mini program pages must avoid the right-top WeChat capsule. Login pages should not place any business action in the capsule area.

## Business Flow 1: Mini Program Login Entry

Page: `apps/wechat-miniprogram/pages/login/index`.

Content:

- Title: `Wardora`
- Subtitle: `管理你的衣橱、套装与种草清单`
- Primary button: `微信登录/注册`
- Secondary button: `邮箱/手机号登录`
- Tertiary text button: `通过邮箱注册`
- Tip: `首次微信登录需要绑定已有账号或注册新账号。`
- Agreement text: `继续即代表您已阅读并同意《用户服务协议》和《隐私政策》。`

Style:

- Page background `#FBFBF8`.
- Hero/card width `686rpx`, margin top `statusBarHeight + 128rpx`.
- Title font `52rpx`, line height `64rpx`, weight 700, color `#1F2933`.
- Subtitle font `28rpx`, line height `42rpx`, color `#6B7280`.
- Button stack gap `24rpx`.
- Primary button background `#2F6B4F`, pressed `#285A43`, text `#FFFFFF`.
- Secondary button background `#FFFFFF`, border `rgba(31,41,51,0.10)`, text `#1F2933`.
- Tertiary button text `#2F6B4F`, no filled card.

Operation:

- Tap `微信登录/注册`: run `onWechatLogin`, call `wx.login`, then `/api/auth/wechat/login`.
- Tap `邮箱/手机号登录`: navigate to password login page.
- Tap `通过邮箱注册`: navigate to direct email register page.
- No `open-type="getPhoneNumber"`.
- No `bindgetphonenumber`.
- No raw WeChat JSAPI error text shown to user.

## Business Flow 2: WeChat Login / Registration Branch

### Bound WeChat

If `/api/auth/wechat/login` returns `status=logged_in`:

- Save token in mini program runtime session.
- Switch tab to `/pages/wardrobe/index/index`.
- Workspace data is read with the same `userId` as App/PWA.

### Unbound WeChat

If `/api/auth/wechat/login` returns `status=requires_account_binding`:

- Navigate to `/pages/login/connect-account/index?ticket=...`.
- Do not create user yet.

Page: `pages/login/connect-account`.

Content:

- Back button.
- Title: `连接 Wardora 账号`
- Body: `请选择绑定已有账号，或创建一个新账号。`
- Card 1 title: `绑定已有账号`
- Card 1 description: `使用 App 已注册的邮箱/手机号和密码登录`
- Card 1 action: `绑定账号`
- Card 2 title: `注册新账号`
- Card 2 description: `使用邮箱创建账号，并自动绑定当前微信`
- Card 2 action: `注册账号`

Style:

- Page background `#FBFBF8`.
- Back button `72rpx` square, left `32rpx`, top `statusBarHeight + 8rpx`.
- Title top `statusBarHeight + 128rpx`, font `44rpx`, line height `56rpx`, weight 700.
- Cards width `686rpx`, min height `168rpx`, padding `32rpx`, radius `32rpx`, background `#FFFFFF`, border `rgba(31,41,51,0.08)`.
- Card title font `32rpx`, weight 700, color `#1F2933`.
- Card description font `24rpx`, line height `36rpx`, color `#6B7280`.
- Card action text `#2F6B4F`.

Operation:

- Tap card 1: navigate to `/pages/login/bind-existing/index?ticket=...`.
- Tap card 2: navigate to `/pages/login/register-email/index?ticket=...`.
- Back returns to login page if no previous page exists.

## Business Flow 3: Bind Existing Account

Page: `pages/login/bind-existing`.

Content:

- Back button.
- Title: `绑定已有账号`
- Description: `使用 App 已注册的邮箱/手机号和密码登录，绑定后 App 与小程序将同步同一套衣橱数据。`
- Field: `邮箱或手机号`
- Field: `密码`
- Primary button: `绑定并登录`
- Text link: `忘记密码？使用邮箱找回`

Style:

- Same auth page background and spacing.
- Labels font `24rpx`, color `#6B7280`, margin bottom `12rpx`.
- Inputs height `88rpx`, radius `24rpx`, background `#F7F7F3`, border `rgba(31,41,51,0.10)`.
- Primary button height `96rpx`, radius `28rpx`, background `#2F6B4F`.
- Error box background `#FEF3F2`, text `#B42318`, radius `20rpx`, padding `20rpx`.

Operation:

- Validate non-empty account and password length 8-256 before submit.
- Submit to `/api/auth/wechat/bind-existing-account`.
- Success: set runtime session, switch to wardrobe tab.
- `invalid_credentials`: show `账号或密码不正确。`
- `wechat_already_bound`: show `当前微信已绑定其他账号。`
- `account_already_bound_wechat`: show `该账号已绑定其他微信，请先用原微信登录后在设置中更换绑定。`
- `binding_ticket_expired`: show `微信登录状态已过期，请重新点击微信登录。`

## Business Flow 4: Email Registration

This page is used by:

- App/PWA register page.
- Mini program direct `通过邮箱注册`.
- Mini program WeChat unbound `注册新账号`.

Page names:

- App/PWA: existing auth gate register view.
- Mini program direct: `pages/login/register-email/index`.
- Mini program WeChat registration: same page with `ticket` query param.

Content:

- Title for direct registration: `创建 Wardora 账号`
- Title for WeChat registration: `注册新账号`
- Description: `邮箱用于登录、找回密码和账号安全验证。`
- Field: `邮箱`
- Inline email action button: `发送验证码`, then `30s`, then `再次发送`
- Confirm dialog title: `发送邮箱验证码`
- Confirm dialog body: `验证码将发送至 {emailMasked}，10 分钟内有效。确认发送？`
- Confirm dialog buttons: `取消`, `确认发送`
- Field shown after sending: `邮箱验证码`
- Field: `密码`
- Field: `确认密码`
- Field: `手机号（选填）`
- Hint: `手机号暂不验证，仅作为手机号+密码登录名使用。`
- Primary button: `注册并登录`

Style:

- Email input row is one input shell, height `88rpx`, radius `24rpx`, background `#F7F7F3`, border `rgba(31,41,51,0.10)`.
- Email text input uses left padding `28rpx`.
- Inline send button is inside the right side of the email input shell, height `68rpx`, right margin `10rpx`, radius `20rpx`.
- Send button enabled background `#2F6B4F`, text `#FFFFFF`.
- Send button disabled background `#E5E7EB`, text `#6B7280`.
- Verification code field appears below email input with top margin `20rpx`.
- Phone hint font `22rpx`, line height `34rpx`, color `#9CA3AF`.
- Primary button margin top `48rpx`.

Operation:

1. User enters email.
2. User taps `发送验证码`.
3. Client validates email format.
4. Client shows confirm dialog.
5. User taps `确认发送`.
6. Client calls `/api/auth/email/send-code`.
7. Button becomes disabled and displays `30s`.
8. `邮箱验证码` input appears.
9. After countdown, button becomes enabled with `再次发送`.
10. User enters code, password, confirm password, and optional phone.
11. Client validates passwords match and password length 8-256.
12. Direct registration calls `/api/auth/register` with `purpose=register` code.
13. WeChat registration calls `/api/auth/wechat/register-with-email` with `bindingTicket` and `purpose=wechat_register` code.
14. Success sets session and enters workspace.

Validation messages:

- Invalid email: `邮箱格式不正确。`
- Empty code after sending: `请输入邮箱验证码。`
- Password too short: `密码至少需要 8 位。`
- Confirm mismatch: `两次输入的密码不一致。`
- Existing email: `该邮箱已注册，请改用邮箱/手机号登录或绑定已有账号。`
- Existing phone: `该手机号已被使用，请删除手机号后继续注册或绑定已有账号。`

## Business Flow 5: Email Or Phone Password Login

Page:

- App/PWA login view.
- Mini program `pages/login/password`.

Content:

- Title: `邮箱/手机号登录`
- Field: `邮箱或手机号`
- Field: `密码`
- Primary button: `登录`
- Text link: `忘记密码？使用邮箱找回`
- Text link: `通过邮箱注册`

Style:

- Same auth tokens.
- Primary button uses `#2F6B4F`.
- Field labels use `#6B7280`.
- Error box uses `#FEF3F2` and `#B42318`.

Operation:

- Submit `account`, not `phone`.
- Account can be email or phone.
- Phone login does not require `verified_at`.
- Email login requires `verified_at`.
- On success, enter workspace.
- On `email_unverified`, route to email verification state instead of workspace.

## Business Flow 6: Forgot Password

Page:

- App/PWA forgot password view.
- Mini program `pages/login/forgot-password`.

Content:

- Title: `找回密码`
- Description: `请输入已验证邮箱，验证码将发送到该邮箱。`
- Field: `邮箱` with inline send button
- Confirm dialog identical to registration but purpose is password reset.
- Field shown after sending: `邮箱验证码`
- Field: `新密码`
- Field: `确认新密码`
- Primary button: `重置密码`

Style:

- Same inline email-code component and 30-second countdown.
- Primary button `#2F6B4F`.
- Success message background `rgba(47,107,79,0.10)`, text `#2F6B4F`.

Operation:

- Send code via `/api/auth/password/reset/request`.
- Confirm via `/api/auth/password/reset/confirm`.
- Success revokes all old sessions.
- Show `密码已重置，请重新登录。`
- Return to login page.

## Business Flow 7: Change Password

Page:

- App/PWA existing change-password route.
- Mini program account security child page if needed in phase 1.

Content:

- Title: `修改密码`
- Tab or segmented choice:
  - `当前密码`
  - `邮箱验证码`
- Current-password mode fields:
  - `当前密码`
  - `新密码`
  - `确认新密码`
- Email-code mode fields:
  - `邮箱` display-only masked value
  - Inline button `发送验证码`
  - `邮箱验证码`
  - `新密码`
  - `确认新密码`
- Primary button: `保存新密码`

Style:

- Segment selected background `#2F6B4F`, text `#FFFFFF`.
- Segment unselected background `#FFFFFF`, text `#6B7280`, border `rgba(31,41,51,0.10)`.
- Existing App controls should reuse `ui-control-radius`.

Operation:

- Current-password mode calls `/api/auth/password/change`.
- Email-code mode calls `/api/auth/email/send-code` with `purpose=change_password`, then `/api/auth/password/change-with-email-code`.
- Current session stays valid.
- Other sessions are revoked.

## Business Flow 8: Account Security

Page:

- Mini program `pages/settings/account`.
- App/PWA existing account management view.

Content:

- Title: `账号安全`
- Description: `管理 App 与小程序共用的登录方式。`
- Card `邮箱`
  - Main line: masked email or `未绑定`
  - Status: `已验证` or `待验证`
- Card `手机号`
  - Main line: masked phone or `未绑定`
  - Status: `登录名`
  - Hint: `手机号暂不验证，仅用于手机号+密码登录。`
- Card `微信登录`
  - Main line: `已绑定当前小程序` or `未绑定`
  - Hint: `微信登录仅在小程序端使用。`
- Card `密码`
  - Main line: `已设置`
  - Action: `修改密码`
- Logout button: `退出登录`

Style:

- Page background `#FBFBF8`.
- Cards background `#FFFFFF`, border `rgba(31,41,51,0.08)`, radius `32rpx` in mini program.
- Card title `28rpx`, weight 700, color `#1F2933`.
- Card status chip background `rgba(47,107,79,0.10)`, text `#2F6B4F`.
- Phone login-name chip background `rgba(107,114,128,0.10)`, text `#6B7280`.
- Logout button border `rgba(180,35,24,0.20)`, text `#B42318`.

Operation Phase 1:

- Load from `GET /api/auth/account/security`.
- `修改密码` opens password-change page.
- `退出登录` revokes current session where possible and clears local auth session.
- Email change, phone change, WeChat unbind/rebind are shown as unavailable or hidden until phase 2.

## Error Message Policy

Frontend must not show:

- `getPhoneNumber`
- `operateWXData`
- `jsapi has no permission`
- OpenID, UnionID, session key
- provider raw JSON
- verification code in client UI except user-entered code

Shared messages:

```ts
const AUTH_ERROR_MESSAGES = {
  invalid_credentials: "账号或密码不正确。",
  invalid_account_format: "请输入正确的邮箱或手机号。",
  invalid_email: "邮箱格式不正确。",
  invalid_phone: "手机号格式不正确。",
  email_unverified: "请先验证邮箱后继续使用。",
  email_already_registered: "该邮箱已注册，请改用邮箱/手机号登录或绑定已有账号。",
  phone_already_registered: "该手机号已被使用，请删除手机号后继续注册或绑定已有账号。",
  email_code_invalid: "验证码不正确。",
  email_code_expired: "验证码已过期，请重新获取。",
  email_code_attempts_exceeded: "验证码错误次数过多，请重新获取。",
  email_rate_limited: "验证码发送过于频繁，请稍后再试。",
  email_service_unavailable: "邮件服务暂不可用，请稍后再试。",
  wechat_code_invalid: "微信登录授权已过期，请重新点击登录。",
  wechat_already_bound: "当前微信已绑定其他账号。",
  account_already_bound_wechat: "该账号已绑定其他微信，请先用原微信登录后在设置中更换绑定。",
  binding_ticket_expired: "微信登录状态已过期，请重新点击微信登录。",
  last_login_method_forbidden: "请先绑定其他登录方式，再解绑当前登录方式。"
}
```

## Files To Touch In Implementation

Backend:

- `services/wardrobe-api/src/db/schema.ts`
- `services/wardrobe-api/migrations/0014_unified_email_wechat_auth.sql`
- `services/wardrobe-api/src/auth/routes.ts`
- `services/wardrobe-api/src/auth/session.ts`
- `services/wardrobe-api/src/auth/session-routes.ts`
- `services/wardrobe-api/src/auth/email-verification.ts`
- `services/wardrobe-api/src/auth/email-routes.ts`
- `services/wardrobe-api/src/auth/wechat-openid.ts`
- `services/wardrobe-api/src/auth/account-security-routes.ts`
- `services/wardrobe-api/src/email/types.ts`
- `services/wardrobe-api/src/email/mock-sender.ts`
- `services/wardrobe-api/src/email/log-sender.ts`
- `services/wardrobe-api/src/security/hmac.ts`
- `services/wardrobe-api/src/app.ts`
- `packages/cloud-contracts/src/auth/contracts.ts`

Mini program:

- `apps/wechat-miniprogram/app.json`
- `apps/wechat-miniprogram/services/auth.ts`
- `apps/wechat-miniprogram/stores/session.ts`
- `apps/wechat-miniprogram/pages/login/index.*`
- `apps/wechat-miniprogram/pages/login/password/index.*`
- `apps/wechat-miniprogram/pages/login/connect-account/index.*`
- `apps/wechat-miniprogram/pages/login/bind-existing/index.*`
- `apps/wechat-miniprogram/pages/login/register-email/index.*`
- `apps/wechat-miniprogram/pages/login/forgot-password/index.*`
- `apps/wechat-miniprogram/pages/settings/account/index.*`

App/PWA:

- `src/lib/auth-form-validation.ts`
- `src/lib/auth-session-store.ts`
- `src/lib/cloud-auth-api.ts`
- `src/components/auth/auth-provider.tsx`
- `src/components/auth/auth-gate.tsx`
- `src/components/auth/account-views.tsx`

Tests:

- `services/wardrobe-api/tests/email-verification.test.ts`
- `services/wardrobe-api/tests/wechat-openid-auth.test.ts`
- `services/wardrobe-api/tests/account-security.test.ts`
- `scripts/test-wechat-email-auth-flow.ts`
- Existing auth shell and online auth logic tests as needed.

## Commit Plan

1. `v2.1.11 auth schema and contracts`
   - Migration, schema exports, contract types, shared error codes.
   - Verify: `npm run cloud:contracts:typecheck`, `npm run api:typecheck`.

2. `v2.1.11 email verification mock provider`
   - Email sender interface, mock/log providers, challenge state machine, send-code route.
   - Verify: `npm --workspace @wardrobe/wardrobe-api run test -- tests/email-verification.test.ts`.

3. `v2.1.11 account password auth`
   - Register, login with `account`, password reset, password change, account security API.
   - Verify: `npm run api:typecheck`, `npm run api:test`.

4. `v2.1.11 wechat openid auth`
   - OpenID login, binding ticket, bind-existing, register-with-email.
   - Verify: `npm --workspace @wardrobe/wardrobe-api run test -- tests/wechat-openid-auth.test.ts`.

5. `v2.1.11 wechat auth ui`
   - Mini program three-entry login page, connect page, bind page, register page, forgot page.
   - Verify: `npm --prefix apps/wechat-miniprogram run typecheck`, WeChat DevTools compile.

6. `v2.1.11 app auth ui`
   - App login/register/forgot/change/account security UI and session shape.
   - Verify: `npm run typecheck`, `npm run build`.

7. `v2.1.11 auth regression docs`
   - Static contract tests, version history, implementation notes.
   - Verify: `npm run test:logic:auth-client-shell`, `npm run test:logic:auth-flow-v2-0-1`, `npm run test:logic:online-auth-shell`.

APK delivery is only required when the implementation is ready for Android verification, not for this design document.

## Validation Matrix

Phase 1 automated:

- Backend email code lifecycle: generated, hashed, invalid, expired, too many attempts, consumed.
- Backend registration: verified email creates user and token.
- Backend phone login name: phone login works and `verified_at` remains null.
- Backend email login: unverified email blocked; verified email succeeds.
- Backend password reset revokes old sessions.
- Backend WeChat unbound returns binding ticket.
- Backend WeChat bind existing preserves userId.
- Backend WeChat register creates user and binding.
- Mini program static test confirms no `getPhoneNumber` remains in main login.
- Mini program static test confirms three login entry buttons.
- App/PWA typecheck confirms user snapshot supports email and phone labels.

Phase 2 provider:

- Real provider sends email through configured sender.
- Missing API key fails startup readiness or email route with `email_service_unavailable`.
- No verification code appears in production logs.

Phase 3 device:

- Mini program real device tap `微信登录/注册` does not trigger phone-number permission error.
- First-time WeChat login opens connect-account page.
- Bind existing App account shows App workspace data.
- Register new account with email binds current WeChat and enters empty/default workspace.
- Direct email registration can log into App/PWA and mini program.
- Password reset email is received and old password fails.
- Password change works and other device sessions are revoked.

## Security Notes

- Hash OpenID and UnionID with a server-side pepper.
- Hash email verification codes with a server-side pepper.
- Never log password, access token, refresh token, OpenID, UnionID, binding ticket, or MiniMax key.
- Development logs may show verification code only when not production.
- Test-only code lookup must be impossible in production.

## Approval

User approved this design direction on 2026-07-09 before implementation planning.
