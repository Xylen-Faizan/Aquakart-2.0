import { supabase } from '../lib/supabase/client';

export interface ReviewableDelivery {
  delivery_id: string;
  order_id: string;
  supplier_id: string;
  supplier_name: string;
  delivery_date: string;
}

export interface SupplierReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  customer_name: string;
}

export const ReviewService = {
  /**
   * Submit a new supplier review
   */
  async submitReview(deliveryId: string, rating: number, comment?: string) {
    const { data, error } = await supabase.rpc('submit_supplier_review', {
      p_delivery_id: deliveryId,
      p_rating: rating,
      p_comment: comment || null,
    });

    if (error) throw error;
    return data;
  },

  /**
   * Get all deliveries that the current user hasn't reviewed yet
   */
  async getReviewableDeliveries(): Promise<ReviewableDelivery[]> {
    const { data, error } = await supabase.rpc('get_reviewable_deliveries');
    if (error) throw error;
    return data || [];
  },
  
  /**
   * Check if a specific order has an unreviewed delivery
   */
  async getUnreviewedDeliveryForOrder(orderId: string): Promise<ReviewableDelivery | null> {
    const deliveries = await this.getReviewableDeliveries();
    return deliveries.find(d => d.order_id === orderId) || null;
  },

  /**
   * Get reviews for a specific supplier
   */
  async getSupplierReviews(supplierId: string, limit = 10, offset = 0): Promise<SupplierReview[]> {
    const { data, error } = await supabase.rpc('get_supplier_reviews', {
      p_supplier_id: supplierId,
      p_limit: limit,
      p_offset: offset
    });
    
    if (error) throw error;
    return data || [];
  },

  /**
   * Get the aggregate rating for a supplier
   */
  async getSupplierRatingAggregate(supplierId: string): Promise<{ average: number, count: number }> {
    const { data, error } = await supabase.rpc('get_supplier_reviews', {
      p_supplier_id: supplierId,
      p_limit: 1000, // naive approach for now since there's no aggregate RPC
      p_offset: 0
    });
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return { average: 0, count: 0 };
    }
    
    const sum = data.reduce((acc: number, review: any) => acc + review.rating, 0);
    return {
      average: Number((sum / data.length).toFixed(1)),
      count: data.length
    };
  }
};
