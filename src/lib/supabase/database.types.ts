export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lists: {
        Row: {
          id: string
          title: string
          list_type: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          list_type?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          list_type?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lists_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      categories: {
        Row: {
          id: string
          name: string
          order_index: number
          keywords: Json[]
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          order_index?: number
          keywords?: Json[]
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          order_index?: number
          keywords?: Json[]
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'categories_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      list_items: {
        Row: {
          id: string
          list_id: string
          category_id: string | null
          name: string
          quantity: string | null
          is_done: boolean
          done_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          list_id: string
          category_id?: string | null
          name: string
          quantity?: string | null
          is_done?: boolean
          done_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          list_id?: string
          category_id?: string | null
          name?: string
          quantity?: string | null
          is_done?: boolean
          done_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'list_items_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'list_items_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'list_items_list_id_fkey'
            columns: ['list_id']
            isOneToOne: false
            referencedRelation: 'lists'
            referencedColumns: ['id']
          },
        ]
      }
      chat_messages: {
        Row: {
          id: string
          sequence: number
          sender_id: string
          body: string
          created_at: string
        }
        Insert: {
          id: string
          sequence?: never
          sender_id?: string
          body: string
          created_at?: string
        }
        Update: {
          id?: string
          sequence?: never
          sender_id?: string
          body?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chat_messages_sender_id_fkey'
            columns: ['sender_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      chat_read_state: {
        Row: {
          user_id: string
          last_delivered_sequence: number | null
          last_read_sequence: number | null
          updated_at: string
        }
        Insert: {
          user_id: string
          last_delivered_sequence?: number | null
          last_read_sequence?: number | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          last_delivered_sequence?: number | null
          last_read_sequence?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chat_read_state_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chat_read_state_last_delivered_sequence_fkey'
            columns: ['last_delivered_sequence']
            isOneToOne: false
            referencedRelation: 'chat_messages'
            referencedColumns: ['sequence']
          },
          {
            foreignKeyName: 'chat_read_state_last_read_sequence_fkey'
            columns: ['last_read_sequence']
            isOneToOne: false
            referencedRelation: 'chat_messages'
            referencedColumns: ['sequence']
          },
        ]
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          is_active: boolean
          last_success_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          is_active?: boolean
          last_success_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          is_active?: boolean
          last_success_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      notification_events: {
        Row: {
          id: string
          event_type: string
          recipient_id: string
          actor_id: string | null
          source_id: string
          payload: Json
          created_at: string
        }
        Insert: {
          id?: string
          event_type: string
          recipient_id: string
          actor_id?: string | null
          source_id: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          event_type?: string
          recipient_id?: string
          actor_id?: string | null
          source_id?: string
          payload?: Json
          created_at?: string
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          id: string
          event_id: string
          subscription_id: string
          status: string
          attempts: number
          next_attempt_at: string
          lease_until: string | null
          last_status_code: number | null
          last_error: string | null
          sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          subscription_id: string
          status?: string
          attempts?: number
          next_attempt_at?: string
          lease_until?: string | null
          last_status_code?: number | null
          last_error?: string | null
          sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          subscription_id?: string
          status?: string
          attempts?: number
          next_attempt_at?: string
          lease_until?: string | null
          last_status_code?: number | null
          last_error?: string | null
          sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      get_chat_unread_count: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_peer_chat_receipt: {
        Args: Record<PropertyKey, never>
        Returns: Array<{
          last_delivered_sequence: number | null
          last_read_sequence: number | null
        }>
      }
      mark_chat_delivered: {
        Args: { message_sequence: number }
        Returns: number
      }
      mark_chat_read: {
        Args: { message_sequence: number }
        Returns: number
      }
      claim_notification_deliveries: {
        Args: { batch_size?: number }
        Returns: Array<{
          delivery_id: string
          subscription_id: string
          endpoint: string
          p256dh: string
          auth: string
          event_type: string
          source_id: string
          recipient_id: string
          sender_name: string
          message_body: string | null
          attempt_number: number
        }>
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
