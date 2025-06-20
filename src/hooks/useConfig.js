import { useContext } from 'react';
import { getConfigContext } from '../context/ConfigProvider';

export const useConfig = () => {
  const ConfigContext = getConfigContext();
  return useContext(ConfigContext);
};

export default useConfig; 