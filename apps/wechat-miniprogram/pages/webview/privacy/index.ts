import { LEGAL_UPDATED_AT, PRIVACY_SECTIONS } from "../../../generated/legal-copy";
Page({ data: { title: "隐私政策", updatedAt: LEGAL_UPDATED_AT, intro: "本政策说明衣橱穿搭助手在提供个人衣橱、穿搭记录、账号同步和主动 AI 功能时如何处理信息。", sections: PRIVACY_SECTIONS }, onLoad() { wx.setNavigationBarTitle({ title: "隐私政策" }); } });
