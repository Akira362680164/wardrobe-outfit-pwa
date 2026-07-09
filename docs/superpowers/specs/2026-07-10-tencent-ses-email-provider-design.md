# Tencent SES Email Verification Provider Design

## Goal

Replace the phase-one `LogEmailSender` delivery path with a Tencent Cloud SES
provider selected only by backend environment configuration. The existing App,
PWA, and WeChat mini program keep using the same authentication API, user ID,
token, and workspace model.

## Confirmed Inputs

- Verified sender domain: `mail.zhengfangapps.cloud`.
- Sender address: `Wardora <no-reply@mail.zhengfangapps.cloud>`.
- The Tencent SES HTML verification template is awaiting review. Its approved
  `TemplateID` is intentionally not present in this repository.
- The resend cooldown is **60 seconds**. This supersedes the 30-second value
  in the phase-one account-auth design and current client screens.

## Scope

### In Scope

- Tencent SES `SendEmail` API delivery through `tencentcloud-sdk-nodejs` on
  the backend only.
- A single `EmailSender` factory that selects `log` or `tencent-ses` from
  `EMAIL_PROVIDER`.
- Readiness reporting and safe 503 errors when a configured SES provider is
  incomplete or unavailable.
- Existing verification code flows: registration, WeChat-email registration,
  password reset, and email-code password change.
- A `change_email` verification purpose for the future account-security flow.
- Server-enforced resend and hourly limits, plus matching 60-second countdown
  copy in App/PWA and mini program.
- Unit and logic regression coverage without a real Tencent secret or inbox.

### Out Of Scope

- Placing Tencent credentials, TemplateID, or any sender secret in Git,
  clients, logs, tests, or mini-program code.
- Deploying the API, setting production environment variables, or enabling
  `EMAIL_PROVIDER=tencent-ses` before the template is approved.
- A real inbox send, domain/DNS mutation, email-address change endpoint, or
  account-security UI for changing email.
- Reintroducing SMS authentication or WeChat `getPhoneNumber`.

## Existing Contract Decisions

The established API purpose is `wechat_register`, not `wechat_bind`. It stays
unchanged because both clients and the OpenID registration route already use
it. The SES template receives the human-readable value `注册并绑定微信`.

`change_email` is added to the shared purpose enum and template mapping now,
but has no caller until a separate email-change feature is approved. This
avoids an unused account-security endpoint while keeping the delivery layer
ready for it.

The `EmailSender` input continues to include the server-computed masked email
for development logs. Its result becomes:

```ts
type SendVerificationCodeResult = {
  provider: "log" | "tencent-ses";
  messageId?: string;
};
```

The verification service does not expose `messageId` to a client. It uses the
result only as a successful delivery acknowledgement.

## Provider Flow

```text
App / mini program
  -> existing authentication route
  -> EmailVerificationService
  -> EmailSender factory
       -> LogEmailSender (test, development, or EMAIL_PROVIDER=log)
       -> TencentSesEmailSender (EMAIL_PROVIDER=tencent-ses)
  -> Tencent SES SendEmail API
```

`TencentSesEmailSender` sends exactly one destination and uses the approved
template:

```ts
{
  FromEmailAddress: process.env.TENCENT_SES_FROM,
  ReplyToAddresses: process.env.TENCENT_SES_REPLY_TO ?? "",
  Destination: [input.to],
  Subject: "Wardora 邮箱验证码",
  Template: {
    TemplateID: Number(process.env.TENCENT_SES_VERIFY_TEMPLATE_ID),
    TemplateData: JSON.stringify({
      purposeText: emailPurposeText(input.purpose),
      code: input.code,
      minutes: String(input.minutes),
    }),
  },
  TriggerType: 1,
  Unsubscribe: "0",
}
```

The SDK is loaded only in the API process through `createRequire`; no client
bundle imports it. The sender accepts a narrow client test double so provider
tests do not make a network request.

Provider errors are normalized to `EmailSendError`. Error messages contain no
SecretId, SecretKey, full request payload, OpenID, binding ticket, password,
or verification code.

## Configuration And Readiness

`NODE_ENV=test` always selects `LogEmailSender`. In non-test environments,
`EMAIL_PROVIDER` defaults to `log`; `log` also selects `LogEmailSender`.
`tencent-ses` requires all of the following:

```text
TENCENTCLOUD_SECRET_ID
TENCENTCLOUD_SECRET_KEY
TENCENT_SES_FROM
TENCENT_SES_VERIFY_TEMPLATE_ID
```

`TENCENT_SES_REGION` defaults to `ap-guangzhou`, `TENCENT_SES_ENDPOINT`
defaults to `ses.tencentcloudapi.com`, and `TENCENT_SES_REPLY_TO` is optional.
An unsupported `EMAIL_PROVIDER` is an invalid startup configuration. A
configured but incomplete Tencent SES setup keeps the API running with email
dependency `unavailable`; email-dependent authentication routes return 503
with `email_provider_not_configured` rather than pretend that a code was sent.

`/api/ready` gains `dependencies.email`:

- `ready` for log delivery and complete Tencent SES configuration.
- `unavailable` for an incomplete Tencent SES configuration.

## Verification State Machine

The verification-code rules after this change are:

| Rule | Value |
| --- | --- |
| Code format | 6 numeric digits |
| Validity | 10 minutes |
| Same-email resend cooldown | 60 seconds across all purposes |
| Same-email hourly limit | 5 sends across all purposes |
| Same-IP hourly limit | 20 sends across all purposes |
| Wrong-code attempts | 5 per challenge |
| Storage | HMAC/hash only; no plaintext code |
| Successful verification | challenge is consumed immediately |

The verification store adds read methods for recent email and IP challenge
counts. It creates the challenge before dispatch, then deletes that challenge
if provider dispatch fails so a failed email does not consume a cooldown or
hourly quota. Provider availability is checked before challenge creation.

## Client Behavior

All existing registration, password-reset, and email-code password-change
screens retain their current layout and confirmation dialog. Their server
response now reports `cooldownSeconds: 60`; the button shows `60s` then
`再次发送` after the countdown. Client code must use the response field rather
than embed another resend duration.

No new mini-program route, App route, button, color, or layout is introduced.
The mini-program source remains free of `getPhoneNumber` and
`open-type="getPhoneNumber"`.

## Error Handling

The API maps delivery configuration and provider failures without leaking
provider internals:

| Code | HTTP | Client message |
| --- | --- | --- |
| `email_provider_not_configured` | 503 | 邮件服务尚未配置，请稍后再试。 |
| `email_provider_error` | 503 | 邮件发送失败，请稍后再试。 |
| `email_rate_limited` | 429 | 验证码发送过于频繁，请稍后再试。 |
| `email_code_rate_limited` | 429 | 验证码请求过多，请稍后再试。 |

Existing invalid, expired, over-attempted, and consumed-code behavior remains
unchanged.

## Validation

- Factory test: test environment forces `LogEmailSender`.
- Tencent sender test: request fields and template JSON match the contract;
  a fake `MessageId` is returned.
- Tencent sender failure test: a normalized `EmailSendError` is returned with
  no request or secret data.
- Verification tests: code remains hash-only, 60-second cooldown, five
  sends/email/hour, twenty sends/IP/hour, five attempts, consumption, and
  failed-send cleanup.
- Health tests: log ready, complete Tencent ready, incomplete Tencent
  degraded, and email routes return 503 when email is unavailable.
- Client logic tests: App/PWA and mini-program email flows use a 60-second
  response-driven resend timer, and mini-program login source has no
  `getPhoneNumber` capability.
- Commands: cloud-contract typecheck, API typecheck and focused API tests,
  root typecheck, both auth-flow logic checks, online-workspace logic check,
  mini-program typecheck, and production build.

## Activation Runbook

After template approval, an operator sets the approved TemplateID plus the
required Tencent values in the server secret store, restarts the API with
`EMAIL_PROVIDER=tencent-ses`, confirms `/api/ready` reports `email: ready`,
and sends a controlled real-inbox registration code. That deployment and
real-device validation are separate from this implementation change.
