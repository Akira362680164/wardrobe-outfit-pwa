# Wardora 官网部署说明

## 1. 部署边界

Wardora 官网使用 `https://zhengfangapps.cloud` 作为唯一规范地址，`https://www.zhengfangapps.cloud` 永久跳转至根域名。官网是独立静态产物，不连接数据库。

`https://api.zhengfangapps.cloud` 继续只承载 wardrobe API，保留现有 Caddy `reverse_proxy 127.0.0.1:3000`、容器、端口和健康检查。本说明不会提交备案申请，也不授权直接修改生产 DNS。

## 2. 上线前必须配置的信息

在官网构建环境中按真实情况设置：

```bash
export NEXT_PUBLIC_WARDORA_SITE_DOMAIN='https://zhengfangapps.cloud'
# 腾讯云已核验默认值为个人主体“方正”；仅在备案主体正式变更后覆盖。
export NEXT_PUBLIC_WARDORA_SITE_OPERATOR_NAME='方正'
export NEXT_PUBLIC_WARDORA_SITE_CONTACT_EMAIL='公开联系邮箱'
# 使用“互联网信息服务”记录中的网站备案号，不是主体备案号。
export NEXT_PUBLIC_WARDORA_SITE_ICP_NUMBER='鲁ICP备2026037404号-1'
export NEXT_PUBLIC_WARDORA_SITE_POLICE_RECORD_NUMBER='已取得后再填写'
export NEXT_PUBLIC_WARDORA_SITE_POLICE_RECORD_URL='已取得后填写真实公安备案查询链接'
export NEXT_PUBLIC_WARDORA_SITE_PRIVACY_UPDATED_AT='YYYY-MM-DD'
export NEXT_PUBLIC_WARDORA_SITE_TERMS_UPDATED_AT='YYYY-MM-DD'
```

代码已内置 2026-07-10 从腾讯云控制台核验的个人主体“方正”和网站备案号“鲁ICP备2026037404号-1”，环境变量仍可用于正式变更后的覆盖。尚未取得公安备案号时，不设置两项公安备案变量即可，页面会显示“公安备案信息办理中”。腾讯云显示的“公安联网备案数据码”只用于办理流程，不是正式公安备案号，禁止填入官网备案号字段。

环境变量只允许放公开展示信息；数据库口令、JWT、腾讯云 Secret、MiniMax Key 等敏感值不得进入官网构建环境。

## 3. DNS

在域名服务商控制台确认后再操作：

1. 根域名 `@` 配置 A 记录指向官网服务器公网 IPv4；仅在服务器已正确配置 IPv6 时再增加 AAAA 记录。
2. `www` 配置 CNAME 指向 `zhengfangapps.cloud`，或配置到同一托管入口。
3. `api` 记录保持当前 API 服务器目标不变。
4. DNS 生效后分别检查：

```bash
dig +short zhengfangapps.cloud A
dig +short www.zhengfangapps.cloud CNAME
dig +short api.zhengfangapps.cloud A
```

不要为了官网部署修改或覆盖 `api` 记录。

## 4. 构建

在仓库根目录安装锁定依赖并生成官网产物：

```bash
npm install
npm run typecheck
npm run test:logic:website
npm run build:website
```

官网输出位于 `out-website/`。脚本会保留现有 App `out/`；Android 的 `capacitor.config.ts` 仍只读取 `out`。

发布前检查公开信息：

```bash
rg -n '上线前待配置|上线前待确认' out-website
rg -n 'ICP备案信息|公安备案信息|公开联系邮箱' out-website
```

如果第一条仍有命中，必须确认它是否属于尚未取得备案的诚实状态；主体和联系邮箱在正式上线前必须补齐。

## 5. 静态发布目录

推荐使用不可变版本目录和 `current` 符号链接，避免覆盖正在服务的文件。以下操作需要服务器发布权限，应在确认目标路径后由运维人员执行：

```bash
RELEASE_ID="$(date +%Y%m%d%H%M%S)"
sudo install -d -m 755 "/srv/wardora-website/releases/$RELEASE_ID"
sudo cp -R out-website/. "/srv/wardora-website/releases/$RELEASE_ID/"
sudo ln -sfn "/srv/wardora-website/releases/$RELEASE_ID" /srv/wardora-website/current
```

旧发布目录保留用于回滚，不在发布脚本中自动永久删除。

## 6. Caddy 与 HTTPS

仓库 `deploy/caddy/Caddyfile` 包含三个相互独立的域名块：

- `zhengfangapps.cloud`：从 `/srv/wardora-website/current` 提供静态官网。
- `www.zhengfangapps.cloud`：永久跳转到根域名并保留路径。
- `api.zhengfangapps.cloud`：继续反向代理现有 API。

Caddy 在 DNS 正确且 80/443 可达时自动申请和续期 HTTPS 证书，并自动将 HTTP 跳转至 HTTPS。变更前先备份服务器当前配置，再验证和 reload：

```bash
sudo cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.backup.$(date +%Y%m%d%H%M%S)"
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

若证书申请失败，先检查 DNS、备案拦截、80/443 防火墙和 Caddy 日志，不要连续 reload 触发 ACME 失败限流。

## 7. 发布验证

验证 HTTP 跳转、规范域名、公开页面和 API 隔离：

```bash
curl -I http://zhengfangapps.cloud/
curl -I https://zhengfangapps.cloud/
curl -I https://www.zhengfangapps.cloud/privacy/
curl -I https://zhengfangapps.cloud/privacy/
curl -I https://zhengfangapps.cloud/terms/
curl -I https://zhengfangapps.cloud/account-deletion/
curl -I https://zhengfangapps.cloud/contact/
curl -I https://zhengfangapps.cloud/robots.txt
curl -I https://zhengfangapps.cloud/sitemap.xml
curl -I https://zhengfangapps.cloud/a-route-that-does-not-exist
curl -fsS https://api.zhengfangapps.cloud/api/health
```

预期结果：

- HTTP 跳转 HTTPS。
- `www` 跳转根域名并保留路径。
- 五个公开页面无需登录即可返回 HTML。
- 未知路径展示自定义 404 页面；静态托管可能返回 `200`，若备案或 SEO 要求严格 404 状态码，应在 Caddy 中增加专用错误处理并再次验证。
- API health 仍从 `api` 子域返回，官网域名不代理 `/api`。

使用浏览器检查证书链、canonical、备案链接、移动菜单、控制台和混合内容。ICP备案号链接应前往工信部备案查询站；公安备案号取得后检查其链接与真实编号一致。

## 8. 回滚

将 `current` 指回上一个已验证发布目录，校验 Caddy 后 reload：

```bash
sudo ln -sfn /srv/wardora-website/releases/上一个发布目录 /srv/wardora-website/current
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

回滚官网静态目录不应修改 API 容器、数据库或 `api.zhengfangapps.cloud` 站点块。

## 9. 合规复核

本次页面只是基础合规展示，不能替代正式法律意见。上线前必须由运营方核对真实主体、联系方式、备案号、实际数据处理、服务器地域、保存期限、SDK、注销流程、App/小程序内备案展示和用户数据导出删除能力，并确保页面内容与代码及实际运营行为一致。
