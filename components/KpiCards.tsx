import React from 'react';
import { Truck, Zap, OctagonPause, Gauge } from 'lucide-react';
import { FleetStats } from '../types';

interface KpiCardsProps {
  stats: FleetStats;
}

export const KpiCards: React.FC<KpiCardsProps> = ({ stats }) => {
  const cards = [
    {
      title: 'Total Vehículos',
      value: stats.totalVehicles,
      icon: <Truck className="w-6 h-6 text-blue-600" />,
      color: 'bg-blue-50 border-blue-200',
    },
    {
      title: 'En Operación',
      value: stats.activeVehicles,
      icon: <Zap className="w-6 h-6 text-green-600" />,
      color: 'bg-green-50 border-green-200',
    },
    {
      title: 'Detenidos/Apagados',
      value: stats.stoppedVehicles,
      icon: <OctagonPause className="w-6 h-6 text-red-600" />,
      color: 'bg-red-50 border-red-200',
    },
    {
      title: 'Velocidad Promedio',
      value: `${stats.avgSpeed} km/h`,
      icon: <Gauge className="w-6 h-6 text-purple-600" />,
      color: 'bg-purple-50 border-purple-200',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, idx) => (
        <div key={idx} className={`p-4 rounded-xl border ${card.color} shadow-sm transition-all hover:shadow-md`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">{card.title}</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{card.value}</p>
            </div>
            <div className="p-2 bg-white rounded-full shadow-sm">
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};