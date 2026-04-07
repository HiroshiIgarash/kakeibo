class CreateNotifications < ActiveRecord::Migration[8.1]
  def change
    create_table :notifications do |t|
      t.references :notifiable, null: false, polymorphic: true
      t.datetime   :read_at

      t.timestamps
    end

    add_index :notifications, :read_at
  end
end
