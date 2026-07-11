import { deleteCalendarPlan, fetchPlanningSnapshot, getWorkspaceReadState, type MiniCalendarPlan } from "../../../services/workspace";

Page({
  data: { loading:false,error:"",plans:[] as MiniCalendarPlan[],deletingId:"" },
  onLoad(){wx.setNavigationBarTitle({title:"旅行计划"});void this.load();}, onShow(){void this.load();},
  async load(this:any){const state=getWorkspaceReadState();if(state!=="ready"){this.setData({loading:false,error:state==="logged_out"?"登录后查看旅行计划":"请先配置后端 API 域名",plans:[]});return}this.setData({loading:true,error:""});try{const snapshot=await fetchPlanningSnapshot();this.setData({loading:false,plans:snapshot.calendarPlans.filter((plan)=>plan.type==="travel"||plan.type==="business")});}catch(error){this.setData({loading:false,error:error instanceof Error?error.message:"读取计划失败"})}},
  createPlan(){wx.navigateTo({url:"/pages/trips/edit/index?type=travel"})}, openPlan(event:any){wx.navigateTo({url:`/pages/trips/detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}`})}, editPlan(event:any){wx.navigateTo({url:`/pages/trips/edit/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}`})},
  deletePlan(this:any,event:any){const id=event.currentTarget.dataset.id;const plan=(this.data.plans as MiniCalendarPlan[]).find((item)=>item.id===id);if(!plan)return;wx.showModal({title:"删除旅行计划？",content:"相关日期安排将按服务端规则同步处理。",confirmText:"确认删除",success:(result)=>{if(result.confirm)void this.confirmDelete(plan)}})},
  async confirmDelete(this:any,plan:MiniCalendarPlan){this.setData({deletingId:plan.id});try{await deleteCalendarPlan(plan.id,plan.revision);await this.load();}catch(error){wx.showToast({title:error instanceof Error?error.message:"删除失败",icon:"none"})}finally{this.setData({deletingId:""})}},
});
