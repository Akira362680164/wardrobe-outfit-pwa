import { deleteCalendarPlan, fetchPlanningSnapshot, getWorkspaceReadState, type MiniCalendarPlan } from "../../../services/workspace";
import { markRuntimeDomainDirty } from "../../../utils/runtime-refresh";

Page({
  data: { loading:false,error:"",plans:[] as MiniCalendarPlan[],deletingId:"",deleteConfirmOpen:false,deleteConfirmTitle:"",deleteConfirmPlan:null as MiniCalendarPlan|null },
  onLoad(){wx.setNavigationBarTitle({title:"旅行计划"});void this.load();}, onShow(){void this.load();},
  async load(this:any){const state=getWorkspaceReadState();if(state!=="ready"){this.setData({loading:false,error:state==="logged_out"?"登录后查看旅行计划":"请先配置后端 API 域名",plans:[]});return}this.setData({loading:true,error:""});try{const snapshot=await fetchPlanningSnapshot();this.setData({loading:false,plans:snapshot.calendarPlans.filter((plan)=>plan.type==="travel"||plan.type==="business")});}catch(error){this.setData({loading:false,error:error instanceof Error?error.message:"读取计划失败"})}},
  createPlan(){wx.navigateTo({url:"/pages/trips/edit/index?type=travel"})}, openPlan(event:any){wx.navigateTo({url:`/pages/trips/detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}`})}, editPlan(event:any){wx.navigateTo({url:`/pages/trips/edit/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}`})},
  deletePlan(this:any,event:any){const id=event.currentTarget.dataset.id;const plan=(this.data.plans as MiniCalendarPlan[]).find((item)=>item.id===id);if(!plan)return;this.setData({deleteConfirmOpen:true,deleteConfirmTitle:plan.title,deleteConfirmPlan:plan});},
  closeDeleteConfirm(this:any){if(!this.data.deletingId)this.setData({deleteConfirmOpen:false,deleteConfirmPlan:null});},
  confirmDeleteFromSheet(this:any){const plan=this.data.deleteConfirmPlan as MiniCalendarPlan|null;if(!plan)return;this.setData({deleteConfirmOpen:false,deleteConfirmPlan:null});void this.confirmDelete(plan);},
  async confirmDelete(this:any,plan:MiniCalendarPlan){this.setData({deletingId:plan.id});try{await deleteCalendarPlan(plan.id,plan.revision);markRuntimeDomainDirty("planning");await this.load();}catch(error){wx.showToast({title:error instanceof Error?error.message:"删除失败",icon:"none"})}finally{this.setData({deletingId:""})}},
});
