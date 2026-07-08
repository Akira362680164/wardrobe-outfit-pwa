# 微信认证登录后端契约

## 接口

`POST /api/auth/wechat/phone-login`

请求体：

```json
{
  "loginCode": "wx.login 返回的 code",
  "phoneCode": "getPhoneNumber 返回的 code",
  "appId": "小程序 AppID",
  "client": "wechat-miniprogram",
  "deviceId": "小程序本地生成的设备会话 ID",
  "deviceLabel": "可选设备名",
  "agreementVersion": "2026-07-08",
  "privacyVersion": "2026-07-08"
}
```

成功响应：

```json
{
  "token": "access token",
  "refreshToken": "refresh token",
  "expiresAt": "2026-07-08T00:15:00.000Z",
  "refreshTokenExpiresAt": "2026-08-07T00:00:00.000Z",
  "isNewUser": false,
  "nextAction": "home",
  "user": {
    "id": "uuid",
    "phoneMasked": "138****5678"
  }
}
```

`token` 是现有后端 access token，后续请求放入 `Authorization: Bearer <token>`。`refreshToken` 复用现有 `/api/auth/refresh`。

## 错误码

| code | HTTP | retryable | 含义 |
|---|---:|---|---|
| `invalid_request` | 400 | false | 请求体缺字段或 AppID 不匹配 |
| `rate_limited` | 429 | true | 登录尝试过多 |
| `wechat_code_invalid` | 401 | true | `loginCode` 失效 |
| `wechat_phone_unavailable` | 401 | true | `phoneCode` 失效或未拿到手机号 |
| `wechat_service_unavailable` | 503 | true | 微信服务或服务端微信密钥不可用 |
| `account_binding_conflict` | 409 | false | openid 与手机号命中的用户不一致 |
| `session_unavailable` | 500 | true | 本项目会话服务不可用 |

## 服务端配置

- `WECHAT_MINIPROGRAM_APP_ID`：可选；设置后会校验请求 `appId`。
- `WECHAT_MINIPROGRAM_APP_SECRET`：必需；仅服务端环境变量保存，不进源码。
- `PHONE_HASH_SALT`：生产必需；用于 `wechat_accounts.phone_hash`，测试环境使用固定测试盐。

测试使用注入的 `WechatClient` mock，不调用真实微信接口。

## 数据与隐私

- 微信一次性 `loginCode`、`phoneCode` 只在本次请求内使用，不写入数据库。
- 审计事件只记录 `phoneMasked`、`openidHash`、`appId`、协议版本和结果状态，不记录手机号明文。
- 当前既有账号体系仍用 `phone_identities.phone_e164` 匹配旧用户；新增微信绑定表使用 `phone_hash` 做微信侧关联字段。
- 新用户会创建默认衣橱位置，后续业务数据仍只从服务端读取。

## Schema 风险

本批代码在 Drizzle schema 中新增 `wechat_accounts` 表定义，并提供非破坏性 SQL migration：`services/wardrobe-api/migrations/0013_wechat_accounts.sql`。部署前需要按现有 API 发布流程执行迁移：

```sql
CREATE TABLE wechat_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  openid TEXT NOT NULL,
  unionid TEXT,
  phone_hash TEXT NOT NULL,
  phone_masked TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX wechat_accounts_app_openid_unique
ON wechat_accounts(app_id, openid);

CREATE INDEX wechat_accounts_user_id_idx
ON wechat_accounts(user_id);

CREATE INDEX wechat_accounts_phone_hash_idx
ON wechat_accounts(phone_hash);
```

不需要清空或重建现有用户、手机号、session、衣橱业务表。
