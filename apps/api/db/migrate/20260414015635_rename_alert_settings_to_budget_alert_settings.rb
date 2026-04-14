class RenameAlertSettingsToBudgetAlertSettings < ActiveRecord::Migration[8.1]
  def change
    rename_table :alert_settings, :budget_alert_settings
    add_column :budget_alert_settings, :threshold_2, :integer
  end
end
