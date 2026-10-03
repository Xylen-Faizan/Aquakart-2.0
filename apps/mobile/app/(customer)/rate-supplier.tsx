import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReviewService } from '../../services/review';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RateSupplierScreen() {
  const router = useRouter();
  const { delivery_id, supplier_name, order_id } = useLocalSearchParams<{
    delivery_id: string;
    supplier_name: string;
    order_id?: string;
  }>();

  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert("Rating Required", "Please select a rating from 1 to 5 stars.");
      return;
    }

    try {
      setIsSubmitting(true);
      await ReviewService.submitReview(delivery_id as string, rating, comment);
      Alert.alert("Thank you!", "Your review has been verified and submitted.", [
        {
          text: "OK",
          onPress: () => {
            if (order_id) {
              router.replace(`/(customer)/order/${order_id}` as any);
            } else {
              router.back();
            }
          }
        }
      ]);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Submission Failed", err.message || "An error occurred while submitting your review.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Rate Supplier</Text>
          <Text style={styles.subtitle}>Verified Delivery from {supplier_name}</Text>

          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                activeOpacity={0.7}
                style={styles.starButton}
              >
                <Text style={[styles.starIcon, rating >= star && styles.starIconActive]}>
                  {rating >= star ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ratingText}>
            {rating === 0 ? "Select a rating" : `${rating} out of 5 stars`}
          </Text>

          <Text style={styles.label}>Add a comment (optional)</Text>
          <TextInput
            style={styles.textInput}
            multiline
            numberOfLines={4}
            placeholder="How was the delivery experience?"
            placeholderTextColor="#9ca3af"
            value={comment}
            onChangeText={setComment}
            maxLength={1000}
          />
          <Text style={styles.charCount}>{comment.length}/1000</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.submitButton, (rating === 0 || isSubmitting) && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={rating === 0 || isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? "Submitting..." : "Submit Review"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => router.back()}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelButtonText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 24,
    flexGrow: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 32,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  starButton: {
    padding: 8,
  },
  starIcon: {
    fontSize: 48,
    color: '#d1d5db', // Unselected color
  },
  starIconActive: {
    color: '#fbbf24', // Selected color
  },
  ratingText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#4b5563',
    marginBottom: 32,
    fontWeight: '500',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
    marginBottom: 32,
  },
  actions: {
    marginTop: 'auto',
    gap: 16,
  },
  submitButton: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  }
});
