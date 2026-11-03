<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
    <AccountPanel />
    <!-- Basic Info Settings -->
    <div class="bg-white p-6 md:p-8 rounded-[2rem] border-[3px] border-black shadow-cartoon">
      <h3 class="font-black text-slate-800 mb-6 text-xl flex items-center gap-2">
        <Settings :size="24" /> 基础设置
      </h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label class="block text-sm font-bold text-slate-500 mb-2">小朋友名字</label>
          <input
            v-model="editChildName"
            class="w-full p-4 rounded-2xl border-[3px] border-slate-200 focus:border-black focus:outline-none font-black text-lg"
          />
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-bold text-slate-500 mb-2">小朋友头像</label>
          <div class="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4">
            <img v-if="editAvatar" :src="editAvatar" alt="预览" class="w-16 h-16 object-cover rounded-2xl border-2 border-black" />
            <div class="flex items-center gap-2 flex-wrap">
              <input
                id="avatarImageInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleAvatarChange"
              />
              <label
                for="avatarImageInput"
                class="px-4 py-2 rounded-2xl border-2 border-black bg-white hover:bg-slate-50 cursor-pointer font-bold shadow-cartoon-sm"
              >选择图片</label>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-6 flex justify-end">
        <Button @click="handleSaveSettings" variant="primary" :disabled="isAvatarReading">保存修改</Button>
      </div>
    </div>

    <!-- Deductions Quick Settings -->
    <div class="bg-white p-6 md:p-8 rounded-[2rem] border-[3px] border-black shadow-cartoon">
      <h3 class="font-black text-slate-800 mb-4 text-xl flex items-center gap-2">
        <Zap :size="24" /> 扣分快捷设置
      </h3>
      <p class="text-slate-500 font-bold mb-6">
        设置快速扣分选项，方便在总览页面快速扣除积分。
      </p>
      <button @click="$router.push('/deductions-settings')" class="w-full py-4 px-5 rounded-2xl border-[3px] border-black bg-green-500 hover:bg-green-600 text-white font-black shadow-cartoon hover:-translate-y-1 hover:shadow-cartoon-lg transition-all active:scale-95 flex items-center justify-center">
        <Zap class="mr-2" :size="20" :stroke-width="3" />
        进入扣分快捷设置
      </button>
    </div>

    <!-- Data Backup -->
    <div class="bg-white p-6 md:p-8 rounded-[2rem] border-[3px] border-black shadow-cartoon">
      <h3 class="font-black text-slate-800 mb-4 text-xl flex items-center gap-2">
        <Save :size="24" /> 数据备份与恢复
      </h3>
      <p class="text-slate-500 font-bold mb-6">
        将数据导出为文件保存到本地，或者从文件恢复数据。
      </p>

      <div class="flex flex-col sm:flex-row gap-4">
        <Button @click="handleExport" variant="secondary" class="flex-1 py-4">
          <Download class="mr-2" :size="20" :stroke-width="3" />
          导出整个家庭 (JSON)
        </Button>

        <BackupImport class="flex-1" />
      </div>
    </div>

    <div class="bg-white p-6 md:p-8 rounded-[2rem] border-[3px] border-black shadow-cartoon space-y-4">
      <h3 class="font-black text-xl">家庭与同步</h3>
      <p>{{ session?.families.find(f=>f.id===session?.familyId)?.name }} · {{ data.childName }}</p>
      <p class="text-sm text-slate-500">资料来自家庭服务器；手机上的修改会自动刷新。儿童设备使用独立受限会话。</p>
      <div class="flex flex-wrap gap-3"><Button variant="secondary" @click="managing=true">管理家庭</Button><Button variant="secondary" @click="refresh">核对并刷新</Button><Button variant="secondary" @click="makeInvite">邀请家人</Button></div>
      <p v-if="invitation" class="break-all select-all">{{ invitation }}<span class="block text-sm">24 小时有效、仅限一次，请只分享给家人。</span></p>
    </div>
    <div class="bg-orange-50 p-6 rounded-[2rem] border-[3px] border-black shadow-cartoon space-y-3">
      <h3 class="font-black text-xl">余额归零</h3>
      <p class="text-sm">将当前孩子的积分调整为 0，保留全部历史和其他资料，并新增一条调整记录。</p>
      <Button variant="danger" @click="isClearPointsModalOpen=true">调整余额为零</Button>
    </div>
    <p class="text-center text-slate-400 font-bold text-sm">Habit Hero H5 3.2.0 · 家庭同步</p>
    <Modal :is-open="isClearPointsModalOpen" title="将余额调整为零？" @close="isClearPointsModalOpen=false">
      <div class="space-y-4"><p>当前 {{ data.childName }} 有 {{ data.totalPoints }} 分。确认后会新增调整记录，历史流水保留。</p><Button variant="danger" @click="zeroBalance">确认调整</Button></div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import {ref,watch,inject} from 'vue';
import {Settings,Save,Download,Upload,Zap} from 'lucide-vue-next';
import {useAppData,useSync} from '../../composables/useAppData';
import {exportDataToFile} from '../../../services/storageService';
import {safeId} from '../../../services/id';
import type {AppData} from '../../../types';
import Button from '../ui/Button.vue';
import Modal from '../ui/Modal.vue';
import BackupImport from './BackupImport.vue';
import AccountPanel from './AccountPanel.vue';
const props=defineProps<{data:AppData}>();
const {updateData}=useAppData();const {session,managing,refresh,client,action}=useSync();
const showToast=inject<(message:string,type?:'success'|'error'|'info')=>void>('showToast')!;
const editChildName=ref(props.data.childName),editPin=ref(props.data.parentPin),editAvatar=ref<string|null>(props.data.avatar??null),isAvatarReading=ref(false),isClearPointsModalOpen=ref(false),invitation=ref('');
watch(()=>props.data.childName,v=>editChildName.value=v);watch(()=>props.data.parentPin,v=>editPin.value=v);watch(()=>props.data.avatar,v=>editAvatar.value=v??null);
const handlePinInput=(e:Event)=>{editPin.value=(e.target as HTMLInputElement).value.replace(/[^0-9]/g,'').slice(0,4);};
const handleSaveSettings=async()=>{
 if(!/^\d{4}$/.test(editPin.value)||!editChildName.value.trim()){showToast('请输入名字和 4 位数字的家长密码','error');return;}
 await updateData(p=>({...p,childName:editChildName.value,parentPin:editPin.value,avatar:editAvatar.value}));showToast('基础设置已保存');
};
const handleExport=()=>action(()=>exportDataToFile());
const makeInvite=()=>action(async()=>{invitation.value=(await client.request('/invites',{familyId:client.session!.familyId})).code;});
const zeroBalance=async()=>{
 const amount=-props.data.totalPoints;
 if(amount)await updateData(p=>({...p,transactions:[{id:safeId(),type:'adjust',amount,description:'家长将余额调整为零',date:new Date().toISOString()},...p.transactions]}));
 isClearPointsModalOpen.value=false;showToast('余额已调整，历史记录保留');
};
const handleAvatarChange = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    editAvatar.value = null;
    return;
  }
  const reader = new FileReader();
  isAvatarReading.value = true;
  reader.onload = () => {
    const result = reader.result as string;
    const img = new Image();
    img.onload = () => {
      const maxDim = 800;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.85);
        editAvatar.value = compressed;
      } else {
        editAvatar.value = result;
      }
      isAvatarReading.value = false;
    };
    img.onerror = () => {
      editAvatar.value = result;
      isAvatarReading.value = false;
    };
    img.src = result;
  };
  reader.onerror = () => {
    isAvatarReading.value = false;
  };
  reader.readAsDataURL(file);
};

</script>
