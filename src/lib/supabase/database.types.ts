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
      chat_conversations: {
        Row: {
          id: string
          first_user_id: string
          second_user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          first_user_id: string
          second_user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          first_user_id?: string
          second_user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chat_conversations_first_user_id_fkey'
            columns: ['first_user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chat_conversations_second_user_id_fkey'
            columns: ['second_user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      chat_messages: {
        Row: {
          id: string
          sequence: number
          conversation_id: string
          sender_id: string
          body: string
          kind: 'text' | 'photo' | 'gif'
          media_path: string | null
          gif_id: string | null
          created_at: string
        }
        Insert: {
          id: string
          sequence?: never
          conversation_id: string
          sender_id?: string
          body: string
          kind?: 'text' | 'photo' | 'gif'
          media_path?: string | null
          gif_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          sequence?: never
          conversation_id?: string
          sender_id?: string
          body?: string
          kind?: 'text' | 'photo' | 'gif'
          media_path?: string | null
          gif_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chat_messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'chat_conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chat_messages_sender_id_fkey'
            columns: ['sender_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      chat_message_reactions: {
        Row: {
          message_id: string
          conversation_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: {
          message_id: string
          conversation_id: string
          user_id?: string
          emoji: string
          created_at?: string
        }
        Update: {
          message_id?: string
          conversation_id?: string
          user_id?: string
          emoji?: string
          created_at?: string
        }
        Relationships: []
      }
      chat_peer_aliases: {
        Row: { owner_id: string; peer_id: string; alias: string }
        Insert: { owner_id?: string; peer_id: string; alias: string }
        Update: { owner_id?: string; peer_id?: string; alias?: string }
        Relationships: []
      }
      chat_read_state: {
        Row: {
          conversation_id: string
          user_id: string
          last_delivered_sequence: number | null
          last_read_sequence: number | null
          updated_at: string
        }
        Insert: {
          conversation_id: string
          user_id: string
          last_delivered_sequence?: number | null
          last_read_sequence?: number | null
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          user_id?: string
          last_delivered_sequence?: number | null
          last_read_sequence?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chat_read_state_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'chat_conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chat_read_state_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chat_read_state_last_delivered_message_fkey'
            columns: ['conversation_id', 'last_delivered_sequence']
            isOneToOne: false
            referencedRelation: 'chat_messages'
            referencedColumns: ['conversation_id', 'sequence']
          },
          {
            foreignKeyName: 'chat_read_state_last_read_message_fkey'
            columns: ['conversation_id', 'last_read_sequence']
            isOneToOne: false
            referencedRelation: 'chat_messages'
            referencedColumns: ['conversation_id', 'sequence']
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
      set_chat_reaction: {
        Args: { target_message_id: string; selected_emoji: string | null }
        Returns: undefined
      }
      set_chat_peer_alias: {
        Args: { target_peer_id: string; selected_alias: string | null }
        Returns: undefined
      }
      get_chat_inbox: {
        Args: Record<PropertyKey, never>
        Returns: Array<{
          conversation_id: string
          peer_id: string
          peer_email: string
          peer_display_name: string
          peer_alias: string | null
          last_message_id: string | null
          last_message_sender_id: string | null
          last_message_body: string | null
          last_message_kind: 'text' | 'photo' | 'gif' | null
          last_message_sequence: number | null
          last_message_created_at: string | null
          last_incoming_sequence: number | null
          unread_count: number
        }>
      }
      get_chat_peer_receipt: {
        Args: { target_conversation_id: string }
        Returns: Array<{
          last_delivered_sequence: number | null
          last_read_sequence: number | null
        }>
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
          conversation_id: string | null
          attempt_number: number
        }>
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
