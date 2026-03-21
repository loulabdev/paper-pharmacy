export interface UserLocation {
  latitude: number;
  longitude: number;
}

export const getCurrentLocation = (): Promise<UserLocation> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("이 브라우저에서는 위치 정보를 지원하지 않습니다."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error("위치 권한이 거부되었습니다."));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error("현재 위치 정보를 사용할 수 없습니다."));
            break;
          case error.TIMEOUT:
            reject(new Error("위치 확인 시간이 초과되었습니다."));
            break;
          default:
            reject(new Error("위치 정보를 가져오지 못했습니다."));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000 * 60 * 5,
      }
    );
  });
};