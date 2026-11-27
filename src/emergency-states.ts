export type EmergencyState = 'operational' | 'attention' | 'out_of_service' | 'expired' | 'used' | 'depressurized' | 'overpressurized' | 'disabled';
export const EMERGENCY_STATES: Record<EmergencyState, string> = {
 operational: 'Operativo', attention: 'Requiere atención', out_of_service: 'Fuera de servicio',
 expired: 'Vencido', used: 'Usado', depressurized: 'Despresurizado',
 overpressurized: 'Sobrepresurizado', disabled: 'Deshabilitado',
};
