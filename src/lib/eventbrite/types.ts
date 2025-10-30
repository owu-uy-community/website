/**
 * Eventbrite API Types
 * Based on Eventbrite API v3 documentation
 */

export interface EventbriteAttendee {
  id: string;
  created: string;
  changed: string;
  ticket_class_id: string;
  ticket_class_name: string;
  costs: {
    base_price: {
      display: string;
      currency: string;
      value: number;
      major_value: string;
    };
    eventbrite_fee: {
      display: string;
      currency: string;
      value: number;
      major_value: string;
    };
    gross: {
      display: string;
      currency: string;
      value: number;
      major_value: string;
    };
    payment_fee: {
      display: string;
      currency: string;
      value: number;
      major_value: string;
    };
    tax: {
      display: string;
      currency: string;
      value: number;
      major_value: string;
    };
  };
  profile: {
    name: string;
    email: string;
    first_name?: string;
    last_name?: string;
    addresses?: {
      home?: {
        address_1?: string;
        address_2?: string;
        city?: string;
        region?: string;
        postal_code?: string;
        country?: string;
      };
    };
    cell_phone?: string;
    work_phone?: string;
    gender?: string;
    birth_date?: string;
    company?: string;
    job_title?: string;
    website?: string;
  };
  barcodes: Array<{
    barcode: string;
    status: "unused" | "used" | "refunded" | "cancelled";
    created: string;
    changed: string;
    checkin_type: number;
  }>;
  team?: {
    id: string;
    name: string;
    event_id: string;
  };
  affiliate?: string;
  checked_in: boolean;
  cancelled: boolean;
  refunded: boolean;
  status: "Attending" | "Not Attending" | "Declined";
  event_id: string;
  order_id: string;
  guestlist_id?: string;
}

export interface EventbriteAttendeesResponse {
  attendees: EventbriteAttendee[];
  pagination: {
    object_count: number;
    page_number: number;
    page_size: number;
    page_count: number;
    has_more_items: boolean;
  };
}

export interface EventbriteEvent {
  id: string;
  name: {
    text: string;
    html: string;
  };
  description: {
    text: string;
    html: string;
  };
  start: {
    timezone: string;
    local: string;
    utc: string;
  };
  end: {
    timezone: string;
    local: string;
    utc: string;
  };
  created: string;
  changed: string;
  capacity?: number;
  capacity_is_custom?: boolean;
  status: string;
  currency: string;
  listed: boolean;
  shareable: boolean;
  online_event: boolean;
  tx_time_limit: number;
  hide_start_date: boolean;
  hide_end_date: boolean;
  locale: string;
  is_locked: boolean;
  privacy_setting: string;
  is_series: boolean;
  is_series_parent: boolean;
  is_reserved_seating: boolean;
  show_pick_a_seat: boolean;
  show_seatmap_thumbnail: boolean;
  show_colors_in_seatmap_thumbnail: boolean;
  is_free: boolean;
  source: string;
  version: string;
  logo_id?: string;
  organizer_id: string;
  venue_id?: string;
  category_id?: string;
  subcategory_id?: string;
  format_id?: string;
  resource_uri: string;
  is_externally_ticketed: boolean;
}

export interface EventbriteSummary {
  total_attendees: number;
  checked_in: number;
  not_checked_in: number;
  cancelled: number;
  refunded: number;
}
