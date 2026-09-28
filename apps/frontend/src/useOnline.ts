// useOnline.ts: live "is there signal" flag for UI hints such as the Offline pill. Same rule as
// CellMap: only a definite false from NetInfo means offline, because isInternetReachable is null
// before the first probe. Display only; sync decisions stay in useAutoSync.ts.

import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        setOnline(s.isConnected !== false && s.isInternetReachable !== false);
      }),
    [],
  );
  return online;
}
