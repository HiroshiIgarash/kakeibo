require "rails_helper"

RSpec.describe MonthlySummaryJob, type: :job do
  describe "#perform" do
    it "SummaryMailerをdeliver_laterで呼び出す" do
      expect {
        MonthlySummaryJob.perform_now
      }.to have_enqueued_mail(SummaryMailer, :monthly_summary)
    end

    it "前月を対象月として渡す" do
      travel_to Date.new(2024, 4, 1) do
        expect {
          MonthlySummaryJob.perform_now
        }.to have_enqueued_mail(SummaryMailer, :monthly_summary)
          .with(target_month: Date.new(2024, 3, 1))
      end
    end
  end
end
