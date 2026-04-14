class CreatePaceAlerts < ActiveRecord::Migration[8.1]
  def change
    create_table :pace_alerts do |t|
      t.references :category,     null: false, foreign_key: true
      t.date       :month,        null: false
      t.datetime   :triggered_at, null: false
      t.datetime   :recovered_at

      t.timestamps
    end
  end
end
