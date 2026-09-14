import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';

interface WaterRippleProps {
  style?: ViewStyle;
  color?: string;
  duration?: number;
  maxScale?: number;
}

export function WaterRipple({ 
  style, 
  color = theme.colors.aqua, 
  duration = 2000, 
  maxScale = 3 
}: WaterRippleProps) {
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    const animate = () => {
      scale.setValue(0.5);
      opacity.setValue(0.8);

      Animated.parallel([
        Animated.timing(scale, {
          toValue: maxScale,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
      ]).start(() => animate()); // Loop infinitely
    };

    animate();

    return () => {
      scale.stopAnimation();
      opacity.stopAnimation();
    };
  }, [duration, maxScale]);

  return (
    <Animated.View
      style={[
        styles.ripple,
        {
          backgroundColor: color,
          transform: [{ scale }],
          opacity,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  ripple: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
});
