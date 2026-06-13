'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatOMR } from '@/lib/utils/formatCurrency';
import { getMonthName } from '@/lib/utils/dates';
import { format, subMonths, parse } from 'date-fns';
import { Payable } from '@/lib/supabase/mockDb';

interface MonthlyTrendChartProps {
  allPayables: Payable[]; // Pass all payables to extract last 6 months
  currentMonthYear: string;
}

export default function MonthlyTrendChart({ allPayables, currentMonthYear }: MonthlyTrendChartProps) {
  // Generate list of last 6 months ending in currentMonthYear
  const data = React.useMemo(() => {
    const monthsList: string[] = [];
    try {
      const baseDate = parse(currentMonthYear, 'yyyy-MM', new Date());
      for (let i = 5; i >= 0; i--) {
        monthsList.push(format(subMonths(baseDate, i), 'yyyy-MM'));
      }
    } catch (e) {
      // Fallback
      monthsList.push(currentMonthYear);
    }

    return monthsList.map((mY) => {
      const monthPayables = allPayables.filter((p) => p.month_year === mY);
      
      const paid = monthPayables
        .reduce((sum, p) => {
          if (p.status === 'paid') return sum + p.amount;
          if (p.status === 'partial') return sum + (p.paid_amount || 0);
          return sum;
        }, 0);

      const pending = monthPayables
        .reduce((sum, p) => {
          if (p.status === 'pending' || p.status === 'overdue') return sum + p.amount;
          if (p.status === 'partial') return sum + (p.amount - (p.paid_amount || 0));
          return sum;
        }, 0);

      const label = getMonthName(mY).split(' ')[0] || mY; // E.g. "June"

      return {
        month: label,
        'Paid Amount': paid,
        'Pending Amount': pending,
      };
    });
  }, [allPayables, currentMonthYear]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-6">
        Monthly Trend (Last 6 Months)
      </h3>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis 
              dataKey="month" 
              stroke="#64748B" 
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="#64748B" 
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip
              formatter={(value: any) => [formatOMR(Number(value || 0)), '']}
              contentStyle={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                color: '#0F172A',
                fontSize: 11
              }}
            />
            <Legend 
              wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
              iconSize={8}
              iconType="circle"
            />
            <Bar dataKey="Paid Amount" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Pending Amount" stackId="a" fill="#4F46E5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
