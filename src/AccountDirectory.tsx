import { createContext } from 'react';
import type { DemoAccount } from './accounts';
export const AccountDirectory = createContext<DemoAccount[] | undefined>(undefined);
