import { format, parse, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';

export const getCurrentMonthYear = () => format(new Date(), 'YYYY-MM');

export const formatMonthYear = (date: Date) => format(date, 'yyyy-MM');

export const getMonthName = (monthYear: string) => {
  try {
    const date = parse(monthYear, 'yyyy-MM', new Date());
    return format(date, 'MMMM yyyy');
  } catch (e) {
    return monthYear;
  }
};

export const getMonthsList = (count: number = 12) => {
  const list = [];
  // Include 12 months in the future, and 'count' months in the past
  let current = addMonths(new Date(), 12);
  const totalPeriods = count + 12;
  for (let i = 0; i < totalPeriods; i++) {
    list.push({
      value: format(current, 'yyyy-MM'),
      label: format(current, 'MMMM yyyy')
    });
    current = subMonths(current, 1);
  }
  return list;
};
