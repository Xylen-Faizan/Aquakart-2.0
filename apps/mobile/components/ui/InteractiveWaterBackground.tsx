import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  Easing
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

// A single static optical drop
const StaticWaterDrop = ({ size, top, left, delay }: { size: number, top: number, left: number, delay: number }) => {
  const floatAnim = useSharedValue(0);
  
  React.useEffect(() => {
    floatAnim.value = withRepeat(
      withTiming(1, { duration: 2500 + delay, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatAnim.value * 8 - 4 }]
  }));

  return (
    <Animated.View style={[styles.staticDropContainer, { width: size, height: size, top, left }, animatedStyle]}>
      <View style={[styles.dropBody, { borderRadius: size / 2 }]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.1)', 'rgba(10,50,150,0.3)']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.3, y: 0.2 }}
          end={{ x: 0.8, y: 0.8 }}
        />
        <View style={styles.specularHighlight} />
        <View style={styles.causticReflection} />
      </View>
    </Animated.View>
  );
};

export const InteractiveWaterBackground = ({ children }: { children?: any }) => {
  const transX = useSharedValue(0);
  const transY = useSharedValue(0);
  const stretchX = useSharedValue(1);
  const stretchY = useSharedValue(1);

  const panGesture = Gesture.Pan()
    .onChange((e) => {
      transX.value += e.changeX;
      transY.value += e.changeY;
      const speed = Math.hypot(e.velocityX, e.velocityY);
      // Fluid dynamic squish & stretch
      stretchX.value = 1 + Math.min(speed / 1800, 0.35);
      stretchY.value = 1 - Math.min(speed / 2400, 0.25);
    })
    .onFinalize(() => {
      transX.value = withSpring(0, { damping: 12, stiffness: 120 });
      transY.value = withSpring(0, { damping: 12, stiffness: 120 });
      stretchX.value = withSpring(1, { damping: 10, stiffness: 150 });
      stretchY.value = withSpring(1, { damping: 10, stiffness: 150 });
    });

  const dropStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: transX.value },
      { translateY: transY.value },
      { scaleX: stretchX.value },
      { scaleY: stretchY.value },
    ],
  }));

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#020b1f', '#081f4a', '#04122d']}
        style={StyleSheet.absoluteFill}
      />
      
      <LinearGradient
        colors={['rgba(56,130,246,0.15)', 'transparent']}
        style={[StyleSheet.absoluteFill, { top: -200, left: -100, width: 600, height: 600, borderRadius: 300 }]}
      />

      <StaticWaterDrop size={50} top={120} left={60} delay={0} />
      <StaticWaterDrop size={30} top={200} left={width - 80} delay={400} />
      <StaticWaterDrop size={70} top={height / 2 - 40} left={width - 90} delay={800} />
      <StaticWaterDrop size={40} top={height - 250} left={70} delay={200} />
      <StaticWaterDrop size={20} top={height - 200} left={100} delay={600} />

      <View style={styles.heroWrapper}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.heroDropContainer, dropStyle]}>
            <View style={styles.dropBody}>
              <LinearGradient
                colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.1)', 'rgba(4,20,60,0.6)']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.3, y: 0.2 }}
                end={{ x: 0.8, y: 0.8 }}
              />
              <View style={[styles.specularHighlight, { top: '15%', left: '20%', width: '32%', height: '22%' }]} />
              <View style={[styles.causticReflection, { bottom: '14%', right: '22%', width: '30%', height: '18%' }]} />
            </View>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.contentOverlay}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#020b1f',
  },
  contentOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
  },
  staticDropContainer: {
    position: 'absolute',
    zIndex: 10,
  },
  heroWrapper: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  heroDropContainer: {
    width: 140,
    height: 140,
  },
  dropBody: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  specularHighlight: {
    position: 'absolute',
    top: '14%',
    left: '20%',
    width: '28%',
    height: '20%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.8)',
    transform: [{ rotate: '-32deg' }],
  },
  causticReflection: {
    position: 'absolute',
    bottom: '12%',
    right: '22%',
    width: '22%',
    height: '14%',
    borderRadius: 999,
    backgroundColor: 'rgba(147,197,253,0.5)',
    transform: [{ rotate: '25deg' }],
  }
});
