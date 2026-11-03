export type TransactionType = 'earn' | 'spend' | 'adjust';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  date: string; // ISO string
}

export interface Habit {
  id: string;
  name: string;
  points: number;
  emoji: string;
}

export interface Reward {
  id: string;
  name: string;
  cost: number;
  emoji: string; // 兼容旧数据
  image?: string; // 新增：奖励图片（data URL 或远程 URL）
}

export interface PendingTask {
  id: string;
  habitId: string;
  habitName: string;
  points: number;
  emoji: string;
  timestamp: string;
}

export interface Deduction {
  id: string;
  name: string;
  points: number;
  emoji: string;
}

export interface AppData {
  childName: string; // New field
  parentPin: string; // New field
  totalPoints: number;
  avatar?: string | null;
  transactions: Transaction[];
  habits: Habit[];
  rewards: Reward[];
  pendingTasks: PendingTask[];
  deductions: Deduction[]; // 扣分快捷选项
}

export const DEFAULT_HABITS: Habit[] = [
  { id: '1', name: '自己穿衣服', points: 10, emoji: '👕' },
  { id: '2', name: '自己吃饭', points: 10, emoji: '🍽️' },
  { id: '3', name: '收拾玩具', points: 10, emoji: '🧸' },
  { id: '4', name: '认真洗手', points: 5, emoji: '🧼' },
  { id: '5', name: '说谢谢', points: 5, emoji: '🙏' },
  { id: '6', name: '分享玩具', points: 10, emoji: '🤝' },
  { id: '7', name: '自己上厕所', points: 10, emoji: '🚽' },
  { id: '8', name: '按时睡觉', points: 15, emoji: '😴' },
  { id: '9', name: '听老师话', points: 10, emoji: '👂' },
  { id: '10', name: '帮助别人', points: 15, emoji: '💝' },
];

export const DEFAULT_REWARDS: Reward[] = [
  { id: '1', name: '看动画片15分钟', cost: 30, emoji: '📺' },
  { id: '2', name: '吃小零食', cost: 20, emoji: '🍪' },
  { id: '3', name: '去公园玩', cost: 50, emoji: '🌳' },
  { id: '4', name: '买小贴纸', cost: 40, emoji: '⭐' },
  { id: '5', name: '听故事', cost: 25, emoji: '📖' },
  { id: '6', name: '玩喜欢的玩具', cost: 30, emoji: '🚗' },
  { id: '7', name: '和爸爸妈妈做手工', cost: 40, emoji: '✂️' },
  { id: '8', name: '选择晚餐', cost: 35, emoji: '🍕' },
  { id: '9', name: '晚睡15分钟', cost: 50, emoji: '🌙' },
  { id: '10', name: '去游乐场', cost: 100, emoji: '🎠' },
];

export const DEFAULT_DEDUCTIONS: Deduction[] = [
  { id: '1', name: '不听话', points: 10, emoji: '😠' },
  { id: '2', name: '乱扔东西', points: 5, emoji: '🗑️' },
  { id: '3', name: '打人/推人', points: 15, emoji: '👊' },
  { id: '4', name: '不分享', points: 10, emoji: '🙅' },
  { id: '5', name: '哭闹发脾气', points: 10, emoji: '😭' },
  { id: '6', name: '不收拾玩具', points: 5, emoji: '🧹' },
  { id: '7', name: '说脏话', points: 15, emoji: '🤬' },
  { id: '8', name: '抢别人东西', points: 15, emoji: '✋' },
  { id: '9', name: '不按时睡觉', points: 10, emoji: '🌙' },
  { id: '10', name: '不礼貌', points: 5, emoji: '😤' },
];