import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

export const formatCurrency = (amount: number): string => {
  const n = Number(amount) || 0;
  const isNeg = n < 0;
  const body = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return `${isNeg ? '-' : ''}₺${body}`;
};

export const formatDate = (date: string | Date): string => dayjs(date).format('DD.MM.YYYY');
export const formatDateTime = (date: string | Date): string => dayjs(date).format('DD.MM.YYYY HH:mm');
export const formatRelative = (date: string | Date): string => dayjs(date).fromNow();

export const getRiskColor = (score: number): string => {
  if (score < 40) return '#27AE60';
  if (score < 70) return '#F39C12';
  return '#E74C3C';
};

export const getRiskLabel = (score: number): string => {
  if (score < 40) return 'Low';
  if (score < 70) return 'Medium';
  return 'High';
};
