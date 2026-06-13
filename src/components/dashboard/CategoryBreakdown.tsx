'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatOMR } from '@/lib/utils/formatCurrency';
import { Payable, Category } from '@/lib/supabase/mockDb';

interface CategoryBreakdownProps {
  payables: Payable[];
  categories: Category[];
}

export default function CategoryBreakdown({ payables, categories }: CategoryBreakdownProps) {
  // Aggregate data by category
  const breakdown = categories.map((cat) => {
    const amount = payables
      .filter((p) => p.category_id === cat.id)
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      name: cat.name,
      amount,
      color: cat.color,
      categoryId: cat.id
    };
  }).filter((item) => item.amount > 0);

  const totalAmount = breakdown.reduce((sum, item) => sum + item.amount, 0);

  // Color mapper from color name to Hex
  const colorMap: Record<string, string> = {
    blue: '#3B82F6',
    violet: '#8B5CF6',
    amber: '#F59E0B',
    orange: '#F97316',
    green: '#10B981',
    rose: '#F43F5E',
    slate: '#64748B'
  };

  const data = breakdown.map((item) => ({
    name: item.name,
    value: item.amount,
    color: colorMap[item.color] || '#6366F1',
    percentage: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0
  }));

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
        <p className="text-sm">No payables record for this month to break down.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-6">
        Category Breakdown
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Donut Chart */}
        <div className="h-48 relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={75}
                paddingAngle={4}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any) => [formatOMR(Number(value || 0)), 'Amount']}
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  color: '#0F172A'
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Center Info Text */}
          <div className="absolute text-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total</span>
            <p className="text-sm font-bold text-slate-900 font-numeric mt-0.5">{formatOMR(totalAmount)}</p>
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
          {data.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-slate-600 font-medium">{item.name}</span>
              </div>
              <div className="text-right">
                <span className="font-bold text-slate-900 font-numeric">{formatOMR(item.value)}</span>
                <span className="text-slate-500 text-[10px] ml-1.5 font-numeric">
                  ({item.percentage.toFixed(1)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
