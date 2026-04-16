Sidekiq.configure_server do |config|
  config.on(:startup) do
    Sidekiq::Cron::Job.load_from_hash(
      "monthly_summary" => {
        "cron"  => "0 1 1 * *",  # 毎月1日 午前1時
        "class" => "MonthlySummaryJob"
      }
    )
  end
end
