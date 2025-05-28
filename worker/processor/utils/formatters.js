export function formatCurrency(amount) {
  const numAmount = Number(amount);
  if (isNaN(numAmount)) return 'Rp0,00';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numAmount);
}

export function formatDate(dateStr) {
  if (!dateStr) dateStr = new Date().toISOString();
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) dateStr = new Date().toISOString();
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}