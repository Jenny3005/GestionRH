import React from 'react';
import { MapPin, Phone, Mail } from 'lucide-react';

export default function FooterContactInfo() {
  const contacts = [
    { icon: MapPin, label: 'Avenue Jean-Paul II, Cotonou, Bénin' },
    { icon: Phone, label: '+229 21 30 70 13' },
    { icon: Mail, label: 'numerique@gouv.bj' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {contacts.map(({ icon: Icon, label }) => (
        <p key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#D4AF37' }}>
            <Icon size={16} />
          </span>
          <span>{label}</span>
        </p>
      ))}
    </div>
  );
}
