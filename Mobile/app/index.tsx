import React, { useEffect } from 'react';
import { StyleSheet, View, Image, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

const COOKIE_SIZE = width * 0.62;
const DRILLING_COMPLETE_DELAY = 1400; // When the cookie stops "opening"

export default function SplashScreen() {
  const router = useRouter();

  // 1. COOKIE LAYERS (Subtle separation)
  const recheioOpacity = useSharedValue(0);
  const recheioTranslateX = useSharedValue(0);
  const recheioTranslateY = useSharedValue(0);

  const backOpacity = useSharedValue(0);
  const backTranslateX = useSharedValue(0);
  const backTranslateY = useSharedValue(0);

  // 2. DROPS (Starts after separation)
  const pingoBigOpacity = useSharedValue(0);
  const pingoBigTranslateY = useSharedValue(0);
  
  const pingoMedOpacity = useSharedValue(0);
  const pingoMedTranslateY = useSharedValue(0);
  
  const pingoSmallOpacity = useSharedValue(0);
  const pingoSmallTranslateY = useSharedValue(0);

  useEffect(() => {
    // PHASE 1: Recheio slides out
    recheioOpacity.value = withDelay(300, withTiming(1, { duration: 500 }));
    recheioTranslateX.value = withDelay(300, withTiming(COOKIE_SIZE * 0.005, { duration: 600, easing: Easing.out(Easing.exp) }));
    recheioTranslateY.value = withDelay(300, withTiming(COOKIE_SIZE * 0.015, { duration: 600, easing: Easing.out(Easing.exp) }));

    // PHASE 2: Back cookie slides out
    backOpacity.value = withDelay(600, withTiming(1, { duration: 500 }));
    backTranslateX.value = withDelay(600, withTiming(COOKIE_SIZE * 0.005, { duration: 800, easing: Easing.out(Easing.exp) }));
    backTranslateY.value = withDelay(600, withTiming(COOKIE_SIZE * 0.015, { duration: 800, easing: Easing.out(Easing.exp) }));

    // PHASE 3: Drop sequence starts ONLY after separation is done
    
    // Pingo Grande (Static reveal as per latest user request)
    pingoBigOpacity.value = withDelay(DRILLING_COMPLETE_DELAY, withTiming(1, { duration: 300 }));
    pingoBigTranslateY.value = withDelay(DRILLING_COMPLETE_DELAY, withTiming(0, {
      duration: 1000,
      easing: Easing.out(Easing.exp),
    }));

    // Pingo Médio (Starts with Big, drips farther)
    pingoMedOpacity.value = withDelay(DRILLING_COMPLETE_DELAY, withTiming(1, { duration: 300 }));
    pingoMedTranslateY.value = withDelay(DRILLING_COMPLETE_DELAY, withTiming(COOKIE_SIZE * 0.238, {
      duration: 1200,
      easing: Easing.out(Easing.exp),
    }));

    // Pingo Pequeno (Starts last, same distance as Médio)
    pingoSmallOpacity.value = withDelay(DRILLING_COMPLETE_DELAY + 300, withTiming(1, { duration: 300 }));
    pingoSmallTranslateY.value = withDelay(DRILLING_COMPLETE_DELAY + 300, withTiming(COOKIE_SIZE * 0.238, {
      duration: 1400,
      easing: Easing.out(Easing.exp),
    }, (finished) => {
      if (finished) {
        runOnJS(navigateHome)();
      }
    }));
  }, []);

  const navigateHome = () => {
    router.replace('/home');
  };

  // ANIMATED STYLES
  const animRecheio = useAnimatedStyle(() => ({
    opacity: recheioOpacity.value,
    transform: [{ translateX: recheioTranslateX.value }, { translateY: recheioTranslateY.value }],
  } as any));

  const animBack = useAnimatedStyle(() => ({
    opacity: backOpacity.value,
    transform: [{ translateX: backTranslateX.value }, { translateY: backTranslateY.value }],
  } as any));

  const animPingoBig = useAnimatedStyle(() => ({
    opacity: pingoBigOpacity.value,
    transform: [{ translateY: pingoBigTranslateY.value }],
  } as any));

  const animPingoMed = useAnimatedStyle(() => ({
    opacity: pingoMedOpacity.value,
    transform: [{ translateY: pingoMedTranslateY.value }],
  } as any));

  const animPingoSmall = useAnimatedStyle(() => ({
    opacity: pingoSmallOpacity.value,
    transform: [{ translateY: pingoSmallTranslateY.value }],
  } as any));

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.imageContainer}>
        {/* Layer 4: BACK COOKIE (Bottom) */}
        <Animated.Image
          source={require('../assets/backCookie.png')}
          resizeMode="contain"
          style={[styles.base, styles.backCookie, animBack]}
        />

        {/* Layer 3: DROPS (Middle-Back) */}
        <Animated.Image
          source={require('../assets/filling/pingopequeno.png')}
          resizeMode="contain"
          style={[styles.base, styles.pingo, styles.pingoSmall, animPingoSmall]}
        />
        <Animated.Image
          source={require('../assets/filling/pingomedio.png')}
          resizeMode="contain"
          style={[styles.base, styles.pingo, styles.pingoMed, animPingoMed]}
        />
        <Animated.Image
          source={require('../assets/filling/pingoGrande.png')}
          resizeMode="contain"
          style={[styles.base, styles.pingo, styles.pingoBig, animPingoBig]}
        />

        {/* Layer 2: RECHEIO (Middle-Front) */}
        <Animated.Image
          source={require('../assets/recheio.png')}
          resizeMode="contain"
          style={[styles.base, styles.recheio, animRecheio]}
        />

        {/* Layer 1: FRONT COOKIE (Top) */}
        <Image
          source={require('../assets/cookie.png')}
          resizeMode="contain"
          style={[styles.base, styles.frontCookie]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0057C8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: COOKIE_SIZE,
    height: COOKIE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  base: {
    width: COOKIE_SIZE,
    height: COOKIE_SIZE,
    position: 'absolute',
  },
  frontCookie: { zIndex: 4 },
  recheio: {
    zIndex: 3,
  },
  pingo: {
    top: COOKIE_SIZE * 0.1, // Start dripping from under the cream
  },
  // Aligning drops more horizontally centered as per target image
  pingoBig: { 
    left: 4, 
    zIndex: 2 
  },
  pingoMed: { 
    left: 2, 
    zIndex: 3 
  },
  pingoSmall: { 
    left: 6, 
    zIndex: 4 
  },
  backCookie: { zIndex: 1 },
});