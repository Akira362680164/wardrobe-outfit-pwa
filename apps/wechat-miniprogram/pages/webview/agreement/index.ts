import { LEGAL_UPDATED_AT, TERMS_SECTIONS } from "../../../generated/legal-copy";
Page({ data: { title: "用户协议", updatedAt: LEGAL_UPDATED_AT, intro: "本协议界定衣橱穿搭助手的服务内容、账号规则、用户上传内容与 AI 辅助边界。", sections: TERMS_SECTIONS }, onLoad() { wx.setNavigationBarTitle({ title: "用户协议" }); } });
