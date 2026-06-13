// Always format OMR with 3 decimal places
export const formatOMR = (amount: number) => {
  const numericAmount = typeof amount === 'number' ? amount : parseFloat(amount || '0');
  return `OMR ${numericAmount.toLocaleString('en-OM', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
};
